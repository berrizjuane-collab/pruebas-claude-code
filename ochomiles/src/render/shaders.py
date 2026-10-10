"""Shaders GLSL del renderizador de terreno (OpenGL 4.3, llvmpipe), en modo diferido.

Pase 1 (GEOM): la malla escribe solo la posicion en el mundo en un G-buffer multimuestreado.
Pase 2 (SHADE): a pantalla completa, sombrea una vez por pixel; en bordes, por muestra.
Pase 3 (POST): bloom, tono (AgX), gradacion, vineta.
"""

COMMON = r"""
#version 430
const float PI = 3.14159265359;
const float R_EARTH = 6360000.0;
const vec3  BR   = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float BM_E = 4.44e-6;
const float HR = 8000.0;
const float HM = 1200.0;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 srgb_to_lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
float expInt(float h0, float h1, float d, float H){
    float dh = h1 - h0;
    if (abs(dh) < 2.0) return d * exp(-0.5*(h0+h1)/H);
    return d * H * (exp(-h0/H) - exp(-h1/H)) / dh;
}
"""

GEOM_VS = COMMON + r"""
in vec3 in_pos;
uniform vec3 u_cam;
uniform mat4 u_viewproj;
uniform float u_reff;
out vec3 v_world;
invariant gl_Position;
void main(){
    vec3 rel = in_pos - u_cam;
    rel.z -= dot(rel.xy, rel.xy) / (2.0 * u_reff);
    v_world = in_pos;
    gl_Position = u_viewproj * vec4(rel, 1.0);
}
"""

GEOM_FS = r"""
#version 430
in vec3 v_world;
layout(location=0) out vec4 g_pos;
void main(){ g_pos = vec4(v_world, 1.0); }
"""

QUAD_VS = r"""
#version 430
in vec2 in_vert;
out vec2 v_uv;
void main(){ v_uv = in_vert*0.5+0.5; gl_Position = vec4(in_vert, 0.0, 1.0); }
"""

SHADE_FS = COMMON + r"""
in vec2 v_uv;
layout(location=0) out vec4 f_color;
layout(location=1) out vec4 f_aux;      // xyz mundo (muestra 0), w distancia (1e9 = cielo)

uniform sampler2DMS t_gbuf;
uniform mat4 u_inv_viewproj;
uniform vec3 u_cam;
uniform float u_reff;
uniform float u_pixang;      // radianes por pixel

uniform sampler2D t_albedo;  uniform vec4 r_albedo;  uniform float u_alb_cell;
uniform sampler2D t_n0; uniform sampler2D t_n1; uniform sampler2D t_n2;
uniform vec4 r_l0; uniform vec4 r_l1; uniform vec4 r_l2;
uniform sampler2D t_h0; uniform sampler2D t_h1; uniform sampler2D t_h2;
uniform sampler2D t_s0; uniform sampler2D t_s1;
uniform sampler2D t_od;
uniform sampler2D t_odv;
uniform sampler2D t_elev;
uniform sampler2D t_sky;
uniform sampler2D t_noise;

uniform vec3  u_sun;
uniform float u_sun_az;
uniform vec3  u_sh[4];
uniform float u_cam_alt;
uniform float u_haze;
uniform float u_style;
uniform float u_contour_m;
uniform float u_detail;
uniform float u_snow_boost;
uniform float u_sun_scale;
uniform vec3  u_tint;
uniform float u_noise_gs;
uniform float u_sky_boost;
uniform float u_sun_disk;
uniform float u_stars;
// mar de nubes (superficie con relieve) y niebla de valle
uniform float u_cl_on;
uniform float u_cl_base;     // altitud de la base (m)
uniform float u_cl_thick;    // espesor maximo de la capa (m)
uniform float u_cl_cov;      // cobertura 0..1
uniform float u_cl_scale;    // escala horizontal (m)
uniform vec2  u_cl_off;      // desplazamiento por viento (m)
uniform float u_fog_dens;    // niebla: densidad (1/m) a la altura de referencia
uniform float u_fog_h;       // altura de referencia de la niebla (m)
uniform float u_fog_fall;    // escala de altura (m)

vec2 uv_of(vec4 r, vec2 p){ return vec2((p.x - r.x)/r.z, (r.y - p.y)/r.w); }
float inside(vec4 r, vec2 p, float m){
    vec2 a = p - vec2(r.x, r.y - r.w);
    vec2 b = vec2(r.x + r.z, r.y) - p;
    return clamp(min(min(a.x, a.y), min(b.x, b.y)) / m, 0.0, 1.0);
}
vec3 nrm(vec2 n){ return vec3(n, sqrt(max(1.0 - dot(n,n), 0.0))); }
float lod_for(float fp, float texel_m){ return max(log2(max(fp, 1e-3) / texel_m), 0.0); }
vec3 sky_lut(vec3 v){
    float az_s = atan(u_sun.x, u_sun.y);
    float az_v = atan(v.x, v.y);
    float d = abs(mod(az_v - az_s + PI, 2.0*PI) - PI) / PI;
    float el = degrees(asin(clamp(v.z, -1.0, 1.0)));
    float y = sqrt(clamp((el + 12.0) / 102.0, 0.0, 1.0));
    return textureLod(t_sky, vec2(d, y), 0.0).rgb;
}
vec3 od_lut(float h, float mu){
    float x = (clamp(mu, -0.35, 1.0) + 0.35) / 1.35;
    float y = sqrt(clamp(h, 0.0, 60000.0) / 60000.0);
    return textureLod(t_od, vec2(x, y), 0.0).rgb;
}
vec3 odv_lut(float h, float mu){
    float x = (clamp(mu, -0.35, 1.0) + 0.35) / 1.35;
    float y = sqrt(clamp(h, 0.0, 60000.0) / 60000.0);
    return textureLod(t_odv, vec2(x, y), 0.0).rgb;
}
vec3 sh_irr(vec3 n){
    float ca = cos(u_sun_az), sa = sin(u_sun_az);
    vec3 m = vec3(n.x*ca - n.y*sa, n.x*sa + n.y*ca, n.z);
    vec3 e = PI * 0.282095 * u_sh[0] + (2.0*PI/3.0) * 0.488603 * (u_sh[1]*m.y + u_sh[2]*m.z + u_sh[3]*m.x);
    return max(e, vec3(0.0));
}
// direccion para consultar las LUT: elevacion >= depresion del horizonte desde h0
vec3 lut_dir(vec3 v, float h0){
    float dip = -sqrt(2.0 * max(h0, 1.0) / R_EARTH) + 0.002;
    if (v.z >= dip) return v;
    vec2 hz = normalize(v.xy + vec2(1e-6));
    return vec3(hz * sqrt(1.0 - dip * dip), dip);
}
// perspectiva aerea analitica (dispersion simple, Rayleigh + Mie) entre la camara y un punto
const float BM_S = 3.996e-6;
vec3 aerial(vec3 col, vec3 v, float dist, float h0, float h1){
    float iR = expInt(h0, h1, dist, HR);
    float iM = expInt(h0, h1, dist, HM);
    vec3 tau = BR * iR + vec3(BM_E * u_haze * iM);
    vec3 T = exp(-tau);
    float c = dot(v, u_sun);
    float pR = 3.0 / (16.0 * PI) * (1.0 + c * c);
    float g = 0.8;
    float pM = 3.0 / (8.0 * PI) * ((1.0 - g*g) * (1.0 + c*c)) / ((2.0 + g*g) * pow(1.0 + g*g - 2.0*g*c, 1.5));
    float hm = max(0.5 * (h0 + h1), 0.0);
    vec3 Es = exp(-od_lut(hm, u_sun.z)) * u_sun_scale;
    vec3 F = (1.0 - T) / max(tau, vec3(1e-6));
    vec3 sca_s = (BR * pR * iR + vec3(BM_S * u_haze * pM * iM)) * F;
    vec3 sca_a = (BR * iR + vec3(BM_S * u_haze * iM)) * F / (4.0 * PI);
    vec3 Eamb = sh_irr(vec3(0.0, 0.0, 1.0)) * 1.6;
    return col * T + Es * sca_s + Eamb * sca_a;
}
vec4 noise_l(vec2 uv, float fp, float tile_m){ return textureLod(t_noise, uv, lod_for(fp, tile_m / 1024.0)); }
// igual, pero sin detalle por debajo de min_m metros (evita el rayado fino en primeros planos)
vec4 noise_m(vec2 uv, float fp, float tile_m, float min_m){ return textureLod(t_noise, uv, lod_for(max(fp, min_m), tile_m / 1024.0)); }

vec3 shade_sky(vec3 v){
    vec3 col = sky_lut(v);
    float cs = dot(v, u_sun);
    float r = acos(clamp(cs, -1.0, 1.0)) / radians(0.2675);
    if (r < 1.0){
        float limb = 1.0 - 0.6 * (1.0 - sqrt(1.0 - r*r));
        col += exp(-od_lut(u_cam_alt, u_sun.z)) * limb * 2500.0 * u_sun_disk;
    }
    if (u_stars > 0.0 && v.z > -0.02){
        vec2 sp = vec2(atan(v.y, v.x), asin(v.z)) * 420.0;
        vec2 cell = floor(sp);
        vec2 o = hash22(cell);
        float m = hash12(cell + 7.3);
        float dd = length(fract(sp) - o);
        float star = smoothstep(0.09, 0.0, dd) * step(0.985, m) * (m - 0.985) * 66.0;
        col += vec3(0.8, 0.85, 1.0) * star * u_stars * 0.02 * smoothstep(-0.02, 0.08, v.z);
    }
    return mix(col, vec3(0.006, 0.008, 0.011), u_style);
}

vec3 shade_terrain(vec3 W, out float dist){
    vec3 Rr = W - u_cam;
    Rr.z -= dot(Rr.xy, Rr.xy) / (2.0 * u_reff);
    dist = length(Rr);
    vec3 V = -Rr / dist;
    vec2 p = W.xy;
    float zr = W.z;
    float fp0 = dist * u_pixang;

    // --- normal del DEM ---
    float w0 = inside(r_l0, p, 2500.0);
    float w1 = inside(r_l1, p, 6000.0);
    vec3 N;
    if (w0 >= 0.999) {
        N = nrm(textureLod(t_n0, uv_of(r_l0, p), lod_for(fp0, 30.0)).xy);
    } else {
        vec3 n2 = nrm(textureLod(t_n2, uv_of(r_l2, p), lod_for(fp0, 270.0)).xy);
        vec3 n1 = nrm(textureLod(t_n1, uv_of(r_l1, p), lod_for(fp0, 90.0)).xy);
        N = normalize(mix(n2, n1, w1));
        if (w0 > 0.0) N = normalize(mix(N, nrm(textureLod(t_n0, uv_of(r_l0, p), lod_for(fp0, 30.0)).xy), w0));
    }
    float fp = fp0 / max(abs(dot(N, V)), 0.25);      // huella del pixel sobre la superficie
    float slope = 1.0 - N.z;
    float steep = smoothstep(0.16, 0.44, slope);

    // --- albedo y nieve ---
    vec4 el = textureLod(t_elev, vec2(clamp((zr - 1000.0)/7800.0, 0.0, 1.0), 0.5), 0.0);
    float big = noise_l(p / 5200.0, fp, 5200.0).r;
    float aspect_n = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    float snow_p = clamp(el.a * (0.85 + 0.35*aspect_n) * u_snow_boost + (big - 0.5)*0.6, 0.0, 1.0);
    vec3 alb = mix(el.rgb * (0.8 + 0.4*noise_l(p/7300.0, fp, 7300.0).a), vec3(0.82, 0.85, 0.88), snow_p);
    float snow = snow_p;
    float snow_avg = snow_p;
    float wa = inside(r_albedo, p, 2000.0);
    if (wa > 0.0){
        // deformacion sutil (+-18 m) para romper la redondez de las manchas de 10 m
        vec2 wv = (noise_l(p / 170.0, fp, 170.0).gb * 2.0 - 1.0) * 18.0;
        vec2 uva = uv_of(r_albedo, p + wv);
        float la = lod_for(fp, u_alb_cell);
        vec4 a = textureLod(t_albedo, uva, la);
        vec4 a_avg = textureLod(t_albedo, uva, max(la, 4.0));
        alb = mix(alb, srgb_to_lin(a.rgb), wa);
        snow = mix(snow, a.a, wa);
        snow_avg = mix(snow_avg, a_avg.a, wa);
    }

    // --- paredes: proyeccion triplanar con canales verticales ---
    vec2 nh2 = N.xy * N.xy;
    float wx = nh2.x / max(nh2.x + nh2.y, 1e-4);
    float k = u_noise_gs * 1024.0;
    vec4 rx1 = noise_m(vec2(p.y / 110.0, zr / 360.0), fp, 110.0, 4.0);
    vec4 ry1 = noise_m(vec2(p.x / 110.0, zr / 360.0) + vec2(0.41, 0.23), fp, 110.0, 4.0);
    vec4 rx2 = noise_m(vec2(p.y / 38.0, zr / 115.0) + vec2(0.13, 0.71), fp, 38.0, 2.5);
    vec4 ry2 = noise_m(vec2(p.x / 38.0, zr / 115.0) + vec2(0.67, 0.29), fp, 38.0, 2.5);
    float dyx = ((rx1.g * 2.0 - 1.0) * k / 110.0) + ((rx2.g * 2.0 - 1.0) * k / 38.0) * 0.22;
    float dxy = ((ry1.g * 2.0 - 1.0) * k / 110.0) + ((ry2.g * 2.0 - 1.0) * k / 38.0) * 0.22;
    vec2 gw = vec2(dxy * (1.0 - wx), dyx * wx) * 1.7;
    float rib = mix(ry1.r * 0.75 + ry2.r * 0.25, rx1.r * 0.75 + rx2.r * 0.25, wx) - 0.5;
    vec4 d1 = noise_l(p / 300.0, fp, 300.0);
    vec2 gi = (d1.gb * 2.0 - 1.0) * k / 300.0 * 0.9;
    vec2 pert = mix(gi, gw, steep) * u_detail;
    float pl = length(pert);
    if (pl > 0.40) pert *= 0.40 / pl;
    N = normalize(N + vec3(-pert, 0.0));

    // nieve en paredes: canales y repisas en dos escalas (sin rayado fino uniforme)
    float sj = noise_l(vec2(p.x / 900.0, p.y / 900.0), fp, 900.0).r * 2.5;
    float strata = mix(noise_l(vec2(p.x / 3200.0, zr / 110.0 + sj), fp, 110.0).r,
                       noise_l(vec2(p.y / 3200.0, zr / 110.0 + sj) + 0.5, fp, 110.0).r, wx);
    float flx = 0.6 * noise_m(vec2(p.y / 140.0, zr / 420.0) + vec2(0.53, 0.11), fp, 140.0, 4.0).a
              + 0.4 * noise_m(vec2(p.y / 50.0, zr / 170.0) + vec2(0.27, 0.61), fp, 50.0, 2.5).a;
    float fly = 0.6 * noise_m(vec2(p.x / 140.0, zr / 420.0) + vec2(0.19, 0.83), fp, 140.0, 4.0).a
              + 0.4 * noise_m(vec2(p.x / 50.0, zr / 170.0) + vec2(0.71, 0.37), fp, 50.0, 2.5).a;
    float fl = mix(fly, flx, wx) - rib * 0.9 + (strata - 0.5) * 0.45;
    float keep = 1.0 - 0.55 * smoothstep(0.30, 0.62, slope);
    float th = 1.0 - clamp(snow_avg * keep, 0.0, 1.0);
    float fwd = clamp(0.09 + fp / 50.0, 0.09, 0.45);          // antialias del umbral segun la huella
    float fsnow = smoothstep(th - fwd, th + fwd, fl + 0.05);
    vec3 rock = el.rgb * (0.78 + 0.45 * strata);
    snow = mix(snow, fsnow, steep);
    alb = mix(alb, mix(rock, vec3(0.83, 0.86, 0.89), fsnow), steep);
    float vert = smoothstep(0.66, 0.82, slope);
    snow *= 1.0 - vert;
    alb = mix(alb, rock, vert * (1.0 - snow));
    float lum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
    alb = mix(max(alb, vec3(0.085, 0.075, 0.065)), alb, snow);
    alb = mix(alb, vec3(lum), 0.15 * (1.0 - snow));
    alb *= mix(1.0, 0.86 + 0.28 * d1.r, u_detail * (1.0 - snow));

    // --- sol ---
    vec3 upP = normalize(vec3(p / R_EARTH, 1.0));
    float mu_s = dot(u_sun, upP);
    float el_s = asin(clamp(mu_s, -1.0, 1.0));
    vec3 Tsun = exp(-od_lut(max(zr, 0.0), mu_s));
    float hz;
    if (w0 >= 0.999) hz = textureLod(t_h0, uv_of(r_l0, p), 0.0).r;
    else {
        hz = mix(textureLod(t_h2, uv_of(r_l2, p), 0.0).r, textureLod(t_h1, uv_of(r_l1, p), 0.0).r, w1);
        if (w0 > 0.0) hz = mix(hz, textureLod(t_h0, uv_of(r_l0, p), 0.0).r, w0);
    }
    float pen = radians(0.5);
    float lit = smoothstep(-pen, pen, el_s - hz);
    vec3 L = normalize(vec3(u_sun.xy, mu_s));
    float ndl = max(dot(N, L), 0.0);
    vec3 Esun = Tsun * lit * u_sun_scale * u_tint;

    float svf = textureLod(t_s1, uv_of(r_l1, p), 0.0).r;
    if (w0 > 0.0) svf = mix(svf, textureLod(t_s0, uv_of(r_l0, p), 0.0).r, w0);
    svf = mix(1.0, svf, w1);
    vec3 Esky = sh_irr(N) * mix(svf, 1.0, 0.15) * u_sky_boost;
    vec3 Ehor = sh_irr(vec3(0,0,1)) + Tsun * max(mu_s, 0.0) * u_sun_scale;
    vec3 Ebounce = Ehor * 0.30 * (1.0 - svf) * mix(vec3(0.22), vec3(0.75), snow);

    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float a2 = 0.36;
    float D = a2 / (PI * pow(nh*nh*(a2-1.0)+1.0, 2.0));
    float F = 0.03 + 0.97 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float spec = snow * D * F * 0.25 / max(dot(N, V), 0.2);
    float wrap = snow * 0.12 * max(dot(N, L) + 0.3, 0.0) / 1.3 * lit;
    vec3 col = alb / PI * (Esun * (ndl + wrap) + Esky + Ebounce) + Esun * ndl * spec * 0.6;

    // --- estilo atlas ---
    if (u_style > 0.001){
        vec3 Ln = normalize(vec3(-0.6, 0.6, 0.75));
        float hs = clamp(dot(N, Ln), 0.0, 1.0);
        float t = clamp((zr - 500.0) / 8000.0, 0.0, 1.0);
        vec3 c_low = vec3(0.020, 0.028, 0.040);
        vec3 c_mid = vec3(0.085, 0.120, 0.150);
        vec3 c_high = vec3(0.70, 0.74, 0.76);
        vec3 tint = mix(mix(c_low, c_mid, smoothstep(0.0, 0.55, t)), c_high, smoothstep(0.55, 1.0, t));
        vec3 atlas = tint * (0.30 + 0.95 * hs);
        float zc = zr / u_contour_m;
        float fw = max(fp / max(u_contour_m, 1.0) * max(slope * 3.0, 0.05), 1e-4);
        float fr = abs(fract(zc - 0.5) - 0.5) / fw;
        float line = 1.0 - smoothstep(0.4, 1.4, fr);
        float zc5 = zr / (u_contour_m * 5.0);
        float idx = abs(fract(zc5 - 0.5) - 0.5) / max(fw / 5.0, 1e-4);
        float iline = 1.0 - smoothstep(0.6, 1.8, idx);
        float lfade = 1.0 - smoothstep(0.25, 0.6, fw);
        atlas = mix(atlas, vec3(0.80, 0.86, 0.88) * 0.55, max(line * 0.45, iline * 0.8) * lfade);
        col = mix(col, atlas * 0.35, u_style);
    }

    // --- perspectiva aerea ---
    vec3 fogged = aerial(col, -V, dist, u_cam_alt, max(zr, 0.0));
    return mix(fogged, col, u_style * 0.85);
}

// ---------------- mar de nubes ----------------
vec3 cl_noise(vec2 xy, float fp){
    vec2 q = (xy + u_cl_off) / u_cl_scale;
    float n1 = textureLod(t_noise, q * 0.23, lod_for(fp, u_cl_scale / 0.23 / 1024.0)).r;
    float n2 = textureLod(t_noise, q * 0.71 + 0.37, lod_for(fp, u_cl_scale / 0.71 / 1024.0)).r;
    float n3 = textureLod(t_noise, q * 2.3 + 0.71, lod_for(fp, u_cl_scale / 2.3 / 1024.0)).r;
    return vec3(n1, n2, n3);
}
// cobertura (transparencia): huecos del mar de nubes
float cl_cover(vec2 xy, float fp){
    vec3 n = cl_noise(xy, fp);
    float cov = n.x * 0.55 + n.y * 0.30 + n.z * 0.15;
    float th = 0.62 - u_cl_cov * 0.30;
    return smoothstep(th - 0.08, th + 0.10, cov);
}
// techo de la nube: ondulacion suave (pendientes de pocos grados), sin acantilados
float cl_top(vec2 xy, float fp){
    vec3 n = cl_noise(xy, fp);
    float h = clamp(0.5 + (n.x - 0.5) * 1.8 + (n.y - 0.5) * 0.5, 0.0, 1.0);
    return u_cl_base + u_cl_thick * h;
}
// altitud real a lo largo del rayo (marco de la camara, con curvatura)
float ray_alt(vec3 v, float t){ float d = t * length(v.xy); return u_cam_alt + v.z * t + d * d / (2.0 * u_reff); }
vec4 cloud_layer(vec3 v, float t_max, out float t_hit){
    // losa volumetrica [base, base+thick]: densidad = cobertura(xy) * perfil(h)
    t_hit = 1e9;
    if (u_cl_on < 0.5) return vec4(0.0);
    float top = u_cl_base + u_cl_thick;
    float a = (1.0 - v.z * v.z) / (2.0 * u_reff);
    float b = v.z;
    float t0, t1;
    if (u_cam_alt > top) {
        float dt = b * b - 4.0 * a * (u_cam_alt - top);
        if (dt < 0.0 || b >= 0.0) return vec4(0.0);
        t0 = (-b - sqrt(dt)) / (2.0 * a);
        float db = b * b - 4.0 * a * (u_cam_alt - u_cl_base);
        t1 = (db >= 0.0) ? (-b - sqrt(db)) / (2.0 * a) : (-b + sqrt(dt)) / (2.0 * a);
    } else if (u_cam_alt >= u_cl_base) {
        t0 = 0.0;
        float db = b * b - 4.0 * a * (u_cam_alt - u_cl_base);
        t1 = (b < 0.0 && db >= 0.0) ? (-b - sqrt(db)) / (2.0 * a) : 60000.0;
    } else {
        return vec4(0.0);
    }
    t1 = min(t1, min(t_max, 450000.0));
    if (t0 >= t1) return vec4(0.0);
    float fpr = max(t0, 2000.0) * u_pixang * 3.0;
    const int N = 16;
    float dtt = (t1 - t0) / float(N);
    float jitter = hash12(gl_FragCoord.xy) - 0.5;
    float Tr = 1.0;
    vec3 acc = vec3(0.0);
    float sigma = 1.0 / 140.0;
    vec3 Esky = sh_irr(vec3(0.0, 0.0, 1.0));
    float first = -1.0;
    for (int i = 0; i < N; i++){
        float t = t0 + (float(i) + 0.5 + jitter * 0.9) * dtt;
        vec2 xy = u_cam.xy + v.xy * t;
        float h = ray_alt(v, t);
        vec3 n = cl_noise(xy, fpr);
        float cov = smoothstep(0.62 - u_cl_cov * 0.30 - 0.08, 0.62 - u_cl_cov * 0.30 + 0.10,
                               n.x * 0.55 + n.y * 0.30 + n.z * 0.15);
        float topl = u_cl_base + u_cl_thick * (0.62 + 0.38 * n.x + 0.10 * (n.z - 0.5));
        float prof = smoothstep(u_cl_base, u_cl_base + 0.25 * u_cl_thick, h)
                   * (1.0 - smoothstep(topl - 0.30 * u_cl_thick, topl, h));
        float d = cov * prof;
        if (d > 0.002){
            if (first < 0.0) first = t;
            float od = d * sigma * dtt;
            float a_s = 1.0 - exp(-od);
            // luz: sol atenuado por la profundidad bajo el techo local, mas cielo
            vec3 upP = normalize(vec3(xy / R_EARTH, 1.0));
            float mu_s = dot(u_sun, upP);
            float depth = max(topl - h, 0.0);
            float sun_path = depth / max(mu_s, 0.05);
            vec3 Es = exp(-od_lut(h, mu_s)) * u_sun_scale * u_tint * exp(-sun_path * sigma * 0.35)
                    * smoothstep(-0.02, 0.05, mu_s);
            float powder = 1.0 - exp(-depth * sigma * 2.0);
            vec3 L = Es * (0.55 + 0.45 * powder) + Esky * (0.75 + 0.25 * (1.0 - depth / u_cl_thick));
            vec3 c = vec3(0.93, 0.94, 0.96) / PI * L;
            acc += Tr * a_s * c;
            Tr *= 1.0 - a_s;
            if (Tr < 0.01) break;
        }
    }
    float alpha = 1.0 - Tr;
    if (alpha < 0.002) return vec4(0.0);
    vec3 col = acc / max(alpha, 1e-4);
    t_hit = (first > 0.0) ? first : t0;
    float hh = clamp(ray_alt(v, t_hit), u_cl_base, top);
    col = aerial(col, v, t_hit, u_cam_alt, hh);
    return vec4(col, alpha);
}
// niebla de valle: densidad exponencial con la altura, iluminada por cielo y sol
vec3 valley_fog(vec3 col, vec3 v, float dist, float h_end){
    if (u_fog_dens <= 0.0) return col;
    float H = max(u_fog_fall, 10.0);
    float od = u_fog_dens * expInt(u_cam_alt - u_fog_h, h_end - u_fog_h, dist, H);
    float a = 1.0 - exp(-od);
    vec3 Ef = sh_irr(vec3(0.0, 0.0, 1.0)) * 0.9 + exp(-od_lut(max(u_fog_h, 0.0), u_sun.z)) * max(u_sun.z, 0.0) * 0.7 * u_sun_scale;
    vec3 fogc = vec3(0.93, 0.95, 0.98) / PI * Ef * 1.4;
    return mix(col, fogc, a);
}

vec3 ray_dir(vec2 frag){
    vec2 ndc = frag / vec2(textureSize(t_gbuf)) * 2.0 - 1.0;
    vec4 c = u_inv_viewproj * vec4(ndc, 1.0, 1.0);
    return normalize(c.xyz / c.w);
}

vec3 shade_sample(vec4 sm, vec3 v, out float dist){
    vec3 col;
    float tmax;
    if (sm.w > 0.5){
        col = shade_terrain(sm.xyz, dist);
        col = valley_fog(col, v, dist, max(sm.z, 0.0));
        tmax = dist;
    } else {
        col = shade_sky(v);
        dist = 1e9;
        tmax = 1e9;
    }
    float th;
    vec4 cl = cloud_layer(v, tmax, th);
    return mix(col, cl.rgb, cl.a);
}

void main(){
    ivec2 ci = ivec2(gl_FragCoord.xy);
    vec4 s[4];
    for (int i = 0; i < 4; i++) s[i] = texelFetch(t_gbuf, ci, i);
    float cov = s[0].w + s[1].w + s[2].w + s[3].w;
    vec3 v = ray_dir(gl_FragCoord.xy);
    vec3 col;
    float dist = 1e9;
    bool edge = (cov > 0.5 && cov < 3.5);
    if (!edge && cov > 3.5){
        float spread = max(max(distance(s[0].xyz, s[1].xyz), distance(s[0].xyz, s[2].xyz)), distance(s[0].xyz, s[3].xyz));
        float d0 = distance(s[0].xyz, u_cam);
        edge = spread > d0 * u_pixang * 6.0;
    }
    if (!edge){
        col = shade_sample(s[0], v, dist);
    } else {
        col = vec3(0.0);
        float dd;
        for (int i = 0; i < 4; i++) col += shade_sample(s[i], v, dd);
        col *= 0.25;
        if (s[0].w > 0.5) dist = distance(s[0].xyz, u_cam);
    }
    f_color = vec4(col, 1.0);
    f_aux = vec4(s[0].xyz, s[0].w > 0.5 ? dist : 1e9);
}
"""

POST_FS = COMMON + r"""
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D t_hdr;
uniform sampler2D t_bloom;
uniform float u_exposure;
uniform float u_bloom;
uniform vec3  u_lift;
uniform vec3  u_gamma;
uniform vec3  u_gain;
uniform float u_sat;
uniform float u_contrast;
uniform vec3  u_shadow_tint;
uniform vec3  u_high_tint;
uniform float u_vignette;
uniform vec2  u_res;

vec3 agx_curve(vec3 x){
    vec3 x2 = x*x; vec3 x4 = x2*x2;
    return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232;
}
vec3 agx(vec3 v){
    const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                        0.0784335999999992, 0.878468636469772, 0.0784336,
                        0.0792237451477643, 0.0791661274605434, 0.879142973793104);
    const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                         -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                         -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
    const float mn = -12.47393, mx = 4.026069;
    v = m * max(v, vec3(1e-10));
    v = clamp(log2(v), mn, mx);
    v = (v - mn) / (mx - mn);
    v = agx_curve(v);
    return clamp(mi * v, 0.0, 1.0);
}
void main(){
    vec3 c = texture(t_hdr, v_uv).rgb;
    c += texture(t_bloom, v_uv).rgb * u_bloom;
    c *= u_exposure;
    vec3 d = agx(c);
    float l = dot(d, vec3(0.2126, 0.7152, 0.0722));
    d = mix(vec3(l), d, u_sat);
    d = (d - 0.5) * u_contrast + 0.5;
    float sw = 1.0 - smoothstep(0.0, 0.55, l);
    float hw = smoothstep(0.45, 1.0, l);
    d += u_shadow_tint * sw + u_high_tint * hw;
    d = u_gain * (d + u_lift * (1.0 - d));
    d = pow(max(d, 0.0), 1.0 / u_gamma);
    vec2 q = v_uv - 0.5; q.x *= u_res.x / u_res.y;
    d *= 1.0 - u_vignette * smoothstep(0.35, 1.05, length(q));
    f_color = vec4(d, 1.0);
}
"""

BLUR_FS = r"""
#version 430
in vec2 v_uv;
out vec4 f_color;
uniform sampler2D t_src;
uniform vec2 u_dir;
uniform float u_thresh;
void main(){
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int i = -6; i <= 6; i++){
        float w = exp(-float(i*i) / 18.0);
        vec3 s = texture(t_src, v_uv + u_dir * float(i)).rgb;
        if (u_thresh > 0.0) s = min(max(s - vec3(u_thresh), vec3(0.0)), vec3(6.0));
        acc += s * w; wsum += w;
    }
    f_color = vec4(acc / wsum, 1.0);
}
"""
