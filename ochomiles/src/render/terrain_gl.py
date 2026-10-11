"""Renderizador de terreno 3D (moderngl + llvmpipe) con mallas anidadas por plano.

Uso basico:
    r = TerrainRenderer(3840, 2160, samples=4)
    scene = r.prepare(RegionData("khumbu"), focus_xy=(x, y), sun_az=110, sun_el=4)
    img = r.render(scene, camera)        # float32 HxWx3, codificado para pantalla
"""
import hashlib
import math
import os
import time

import moderngl
import numpy as np

from . import shaders
from .region import ROOT, RegionData
from .sky import Atmosphere

CACHE = os.path.join(ROOT, "data", "cache")
R_EFF = 6371000.0 / (1.0 - 0.13)


# --------------------------------------------------------------------------------------
# mallas anidadas
# --------------------------------------------------------------------------------------
def build_levels(region: RegionData, focus, s0=20.0, n0=1536, n=1026, nlev=5):
    """Niveles con espaciado s0*3^k. Cada nivel excluye las celdas cubiertas por el anterior
    y ajusta su borde exterior al nivel siguiente para evitar grietas (union en T)."""
    smax = s0 * 3 ** (nlev - 1)
    ox = round(focus[0] / smax) * smax
    oy = round(focus[1] / smax) * smax
    levels = []
    for k in range(nlev):
        s = s0 * 3 ** k
        N = n0 if k == 0 else n
        half = N * s / 2
        xs = ox - half + np.arange(N + 1) * s
        ys = oy - half + np.arange(N + 1) * s
        X, Y = np.meshgrid(xs, ys)
        Z = region.height(X, Y)
        levels.append({"s": s, "N": N, "xs": xs, "ys": ys, "Z": Z})
    # costuras: el anillo exterior del nivel k coincide con el nivel k+1 interpolado linealmente
    for k in range(nlev - 1):
        L = levels[k]
        Z = L["Z"]
        N = L["N"]
        for side in ("top", "bottom", "left", "right"):
            if side in ("top", "bottom"):
                row = 0 if side == "top" else N
                line = Z[row, :]
            else:
                col = 0 if side == "left" else N
                line = Z[:, col]
            idx = np.arange(N + 1)
            base = (idx // 3) * 3
            nxt = np.minimum(base + 3, N)
            f = (idx - base) / 3.0
            line[:] = line[base] * (1 - f) + line[nxt] * f
    meshes = []
    C = 64  # celdas por bloque (para descartar fuera de camara)
    for k, L in enumerate(levels):
        N = L["N"]
        X, Y = np.meshgrid(L["xs"], L["ys"])
        verts = np.stack([X, Y, L["Z"]], -1).reshape(-1, 3).astype(np.float32)
        i = np.arange((N + 1) * (N + 1), dtype=np.uint32).reshape(N + 1, N + 1)
        keep = np.ones((N, N), bool)
        if k > 0:
            inner = levels[k - 1]["N"] * levels[k - 1]["s"] / L["s"]
            lo = int(round(N / 2 - inner / 2))
            hi = int(round(N / 2 + inner / 2))
            keep[lo:hi, lo:hi] = False
        idx_parts, chunks, off = [], [], 0
        for r0 in range(0, N, C):
            for c0 in range(0, N, C):
                r1, c1 = min(r0 + C, N), min(c0 + C, N)
                kk = keep[r0:r1, c0:c1]
                if not kk.any():
                    continue
                a = i[r0:r1, c0:c1]
                b = i[r0:r1, c0 + 1:c1 + 1]
                c = i[r0 + 1:r1 + 1, c0:c1]
                d = i[r0 + 1:r1 + 1, c0 + 1:c1 + 1]
                tri = np.stack([a, c, b, b, c, d], -1)[kk].reshape(-1)
                zz = L["Z"][r0:r1 + 1, c0:c1 + 1]
                bbox = (L["xs"][c0], L["xs"][c1], L["ys"][r0], L["ys"][r1], float(zz.min()), float(zz.max()))
                chunks.append((off, len(tri), bbox))
                idx_parts.append(tri)
                off += len(tri)
        idx = np.concatenate(idx_parts).astype(np.uint32)
        meshes.append((verts, idx, chunks))
    return meshes, (ox, oy)


def normal_map(z, cell):
    gy, gx = np.gradient(z.astype(np.float32), cell)
    nx, ny = -gx, gy
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    return np.stack([nx * inv, ny * inv], -1).astype(np.float16)


# --------------------------------------------------------------------------------------
# camara
# --------------------------------------------------------------------------------------
def look_at_matrix(eye_rel_dir_fwd, up=(0, 0, 1), roll_deg=0.0):
    f = np.asarray(eye_rel_dir_fwd, np.float64)
    f /= np.linalg.norm(f)
    u = np.asarray(up, np.float64)
    s = np.cross(f, u)
    s /= np.linalg.norm(s)
    u = np.cross(s, f)
    if roll_deg:
        r = math.radians(roll_deg)
        s, u = s * math.cos(r) + u * math.sin(r), -s * math.sin(r) + u * math.cos(r)
    m = np.eye(4)
    m[0, :3] = s
    m[1, :3] = u
    m[2, :3] = -f
    return m


def perspective(fov_y_rad, aspect, near, far):
    t = 1.0 / math.tan(fov_y_rad / 2)
    m = np.zeros((4, 4))
    m[0, 0] = t / aspect
    m[1, 1] = t
    m[2, 2] = (far + near) / (near - far)
    m[2, 3] = 2 * far * near / (near - far)
    m[3, 2] = -1
    return m


class Camera:
    """pos: (x, y, z) en la TM local; target: punto mirado; fov: horizontal en grados."""

    def __init__(self, pos, target=None, fov_h=40.0, roll=0.0, fwd=None, shift=(0.0, 0.0)):
        self.pos = np.asarray(pos, np.float64)
        self.target = None if target is None else np.asarray(target, np.float64)
        self.fov_h = fov_h
        self.roll = roll
        self.fwd = fwd
        self.shift = shift

    def matrices(self, aspect, near=15.0, far=2.4e6):
        if self.fwd is not None:
            f = np.asarray(self.fwd, np.float64)
        else:
            rel = self.target - self.pos
            # el objetivo tambien se ve afectado por la curvatura
            rel[2] -= (rel[0] ** 2 + rel[1] ** 2) / (2 * R_EFF)
            f = rel
        view = look_at_matrix(f, up=getattr(self, "up", (0.0, 0.0, 1.0)), roll_deg=self.roll)
        fov_y = 2 * math.atan(math.tan(math.radians(self.fov_h) / 2) / aspect)
        proj = perspective(fov_y, aspect, near, far)
        # desplazamiento optico (lens shift) para componer sin inclinar la camara
        proj[0, 2] += self.shift[0] * 2
        proj[1, 2] += self.shift[1] * 2
        return view, proj


# --------------------------------------------------------------------------------------
# renderizador
# --------------------------------------------------------------------------------------
class TerrainRenderer:
    def __init__(self, width, height, samples=4):
        self.W, self.H = width, height
        self.ctx = moderngl.create_standalone_context(backend="egl", require=430)
        ctx = self.ctx
        self.geom_prog = ctx.program(vertex_shader=shaders.GEOM_VS, fragment_shader=shaders.GEOM_FS)
        self.shade_prog = ctx.program(vertex_shader=shaders.QUAD_VS, fragment_shader=shaders.SHADE_FS)
        self.post_prog = ctx.program(vertex_shader=shaders.QUAD_VS, fragment_shader=shaders.POST_FS)
        self.blur_prog = ctx.program(vertex_shader=shaders.QUAD_VS, fragment_shader=shaders.BLUR_FS)
        quad = np.array([-1, -1, 1, -1, -1, 1, 1, 1], np.float32)
        self.quad_vbo = ctx.buffer(quad.tobytes())
        self.shade_vao = ctx.vertex_array(self.shade_prog, [(self.quad_vbo, "2f", "in_vert")])
        self.post_vao = ctx.vertex_array(self.post_prog, [(self.quad_vbo, "2f", "in_vert")])
        self.blur_vao = ctx.vertex_array(self.blur_prog, [(self.quad_vbo, "2f", "in_vert")])
        from .noise import detail_texture
        ntex, self.noise_gs = detail_texture()
        self.noise_tex = ctx.texture((ntex.shape[1], ntex.shape[0]), 4, ntex.tobytes(), dtype="f2")
        self.noise_tex.build_mipmaps()
        self.noise_tex.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)
        self.samples = samples
        sz = (width, height)
        self.gbuf = ctx.texture(sz, 4, dtype="f4", samples=samples)
        self.gdepth = ctx.depth_renderbuffer(sz, samples=samples)
        self.gfbo = ctx.framebuffer([self.gbuf], self.gdepth)
        self.hdr = ctx.texture(sz, 4, dtype="f4")
        self.aux = ctx.texture(sz, 4, dtype="f4")
        self.hdr.filter = (moderngl.LINEAR, moderngl.LINEAR)
        self.atlas_tex = ctx.texture(sz, 4, dtype="f2")
        self.atlas_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
        self.shade_fbo = ctx.framebuffer([self.hdr, self.aux, self.atlas_tex])
        bw, bh = width // 4, height // 4
        self.bloom_a = ctx.texture((bw, bh), 4, dtype="f2")
        self.bloom_b = ctx.texture((bw, bh), 4, dtype="f2")
        for t in (self.bloom_a, self.bloom_b):
            t.filter = (moderngl.LINEAR, moderngl.LINEAR)
            t.repeat_x = t.repeat_y = False
        self.bloom_fa = ctx.framebuffer([self.bloom_a])
        self.bloom_fb = ctx.framebuffer([self.bloom_b])
        self.out_tex = ctx.texture(sz, 4, dtype="f2")
        self.out_fbo = ctx.framebuffer([self.out_tex])
        self._region_tex = {}
        self._atm = {}

    # ---------------------------------------------------------------- texturas
    def _tex(self, arr, comps, dtype, mip=True, clamp=True):
        h, w = arr.shape[:2]
        t = self.ctx.texture((w, h), comps, np.ascontiguousarray(arr).tobytes(), dtype=dtype)
        if mip:
            t.build_mipmaps()
            t.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)
        else:
            t.filter = (moderngl.LINEAR, moderngl.LINEAR)
        if clamp:
            t.repeat_x = t.repeat_y = False
        return t

    @staticmethod
    def _rect(g):
        x0, y0, x1, y1 = g.extent
        return (x0, y1, x1 - x0, y1 - y0)

    def region_textures(self, region: RegionData):
        if region.name in self._region_tex:
            return self._region_tex[region.name]
        t0 = time.time()
        tex = {}
        for k, name in enumerate(("L0", "L1", "L2")):
            g = region.levels[name]
            tex[f"n{k}"] = self._tex(normal_map(g.a, g.cell), 2, "f2")
            tex[f"r_l{k}"] = self._rect(g)
        for k, name in enumerate(("L0", "L1")):
            g = region.svf[name]
            tex[f"s{k}"] = self._tex(np.clip(g.a, 0, 1).astype(np.float16), 1, "f2", mip=False)
        g = region.albedo
        tex["albedo"] = self._tex(g.a, 4, "f1")
        tex["r_albedo"] = self._rect(g)
        tex["alb_cell"] = g.cell
        model = region.albedo_model["albedo_by_elevation"]
        lut = np.zeros((40, 4), np.float32)
        zs = 1000 + np.arange(40) * 200
        pts = [(m["z0"], m["rock"], m["snow"]) for m in model if m]
        for i, z in enumerate(zs):
            best = min(pts, key=lambda q: abs(q[0] - z))
            rock = best[1] or [0.16, 0.14, 0.12]
            lut[i, :3] = rock
            lut[i, 3] = best[2]
        tex["elev"] = self._tex(lut[None], 4, "f4", mip=False)
        self._region_tex[region.name] = tex
        print(f"[render] texturas de {region.name} subidas en {time.time()-t0:.1f} s", flush=True)
        return tex

    # ---------------------------------------------------------------- escena por plano
    def prepare(self, region: RegionData, focus_xy, sun_az, sun_el, cam_alt=6000.0, haze=1.0, ozone=1.0):
        import sys
        sys.path.insert(0, os.path.join(ROOT, "src", "geo"))
        from horizon import horizon_angle
        from .region import SHARPEN_VERSION
        tex = self.region_textures(region)
        os.makedirs(CACHE, exist_ok=True)
        hz = {}
        az_key = round(sun_az * 2) / 2
        for k, name in enumerate(("L0", "L1", "L2")):
            g = region.levels[name]
            path = os.path.join(CACHE, f"hz_{region.name}_{name}_{az_key:.1f}_{SHARPEN_VERSION}.npy")
            if os.path.exists(path):
                a = np.load(path)
            else:
                a = horizon_angle(g.a, g.cell, az_key, {"L0": 40000.0, "L1": 150000.0, "L2": 400000.0}[name])
                np.save(path, a.astype(np.float16))
            hz[f"h{k}"] = self._tex(a.astype(np.float16), 1, "f2", mip=False)
        meshes, origin = build_levels(region, focus_xy)
        vaos = []
        for verts, idx, chunks in meshes:
            vbo = self.ctx.buffer(verts.tobytes())
            ibo = self.ctx.buffer(idx.tobytes())
            vao = self.ctx.vertex_array(self.geom_prog, [(vbo, "3f", "in_pos")], ibo)
            vaos.append({"vao": vao, "vbo": vbo, "ibo": ibo, "chunks": chunks,
                         "bb": np.array([c[2] for c in chunks], np.float64)})
        key = (round(haze, 3), round(ozone, 3))
        if key not in self._atm:
            self._atm[key] = Atmosphere(haze=haze, ozone=ozone)
        scene = {"region": region, "tex": tex, "hz": hz, "vaos": vaos, "origin": origin,
                 "atm": self._atm[key], "sun_az": sun_az, "haze": haze}
        self.set_sun(scene, sun_el, cam_alt)
        return scene

    def set_sun(self, scene, sun_el, cam_alt):
        atm = scene["atm"]
        el = math.radians(sun_el)
        lut = atm.sky_lut(cam_alt, el)
        if "sky_tex" in scene:
            scene["sky_tex"].release()
            scene["od_tex"].release()
        scene["sky_tex"] = self._tex(lut, 3, "f4", mip=False)
        scene["od_tex"] = self._tex(atm.od, 3, "f4", mip=False)
        if "odv_tex" in scene:
            scene["odv_tex"].release()
        scene["odv_tex"] = self._tex(atm.odv, 3, "f4", mip=False)
        scene["sh"] = atm.sky_irradiance_sh(cam_alt, el, n=24)
        scene["sun_el"] = sun_el
        scene["cam_alt_lut"] = cam_alt

    def release(self, scene):
        for m in scene["vaos"]:
            for k in ("vao", "vbo", "ibo"):
                m[k].release()
        for t in scene["hz"].values():
            t.release()
        scene["sky_tex"].release()
        scene["od_tex"].release()
        scene["odv_tex"].release()

    # ---------------------------------------------------------------- render
    def render(self, scene, cam: Camera, grade=None, style=0.0, contour_m=200.0, detail=1.0,
               snow_boost=1.0, sun_scale=1.0, sun_tint=(1, 1, 1), stars=0.0, sun_disk=1.0,
               exposure=None, return_aux=False, sky_boost=1.35, clouds=None, fog=None, atlas_exag=2.6):
        ctx = self.ctx
        aspect = self.W / self.H
        view, proj = cam.matrices(aspect, near=getattr(cam, "near", 15.0), far=getattr(cam, "far", 2.4e6))
        vp = (proj @ view).astype(np.float32)
        inv_vp = np.linalg.inv(proj @ view).astype(np.float32)
        az = math.radians(scene["sun_az"])
        el = math.radians(scene["sun_el"])
        sun = np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)], np.float32)
        tex = scene["tex"]

        # pase 1: G-buffer
        self.gfbo.use()
        self.gfbo.clear(0, 0, 0, 0, depth=1.0)
        ctx.enable(moderngl.DEPTH_TEST)
        ctx.depth_func = "<"
        gp = self.geom_prog
        gp["u_viewproj"].write(vp.T.copy().tobytes())
        gp["u_cam"] = tuple(cam.pos.astype(np.float32))
        gp["u_reff"] = R_EFF
        for m, ch in self.visible_chunks(scene, cam, proj @ view):
            for first, count in ch:
                m["vao"].render(vertices=count, first=first)
        ctx.disable(moderngl.DEPTH_TEST)

        # pase 2: sombreado diferido
        self.shade_fbo.use()
        p = self.shade_prog
        units = {"t_gbuf": self.gbuf, "t_albedo": tex["albedo"], "t_n0": tex["n0"], "t_n1": tex["n1"],
                 "t_n2": tex["n2"], "t_h0": scene["hz"]["h0"], "t_h1": scene["hz"]["h1"],
                 "t_h2": scene["hz"]["h2"], "t_s0": tex["s0"], "t_s1": tex["s1"], "t_od": scene["od_tex"],
                 "t_odv": scene["odv_tex"], "t_elev": tex["elev"], "t_sky": scene["sky_tex"],
                 "t_noise": self.noise_tex}
        for i, (name, t) in enumerate(units.items()):
            t.use(i)
            _us(p, name, i)
        _uw(p, "u_inv_viewproj", inv_vp.T.copy().tobytes())
        _us(p, "u_cam", tuple(cam.pos.astype(np.float32)))
        _us(p, "u_reff", R_EFF)
        _us(p, "u_pixang", float(2 * math.tan(math.radians(cam.fov_h) / 2) / self.W))
        _us(p, "r_albedo", tex["r_albedo"])
        _us(p, "u_alb_cell", float(tex["alb_cell"]))
        for k in range(3):
            _us(p, f"r_l{k}", tex[f"r_l{k}"])
        _us(p, "u_sun", tuple(sun))
        _us(p, "u_sun_az", float(az))
        _uw(p, "u_sh", np.ascontiguousarray(scene["sh"], np.float32).tobytes())
        _us(p, "u_cam_alt", float(cam.pos[2]))
        _us(p, "u_haze", float(scene["haze"]))
        _us(p, "u_style", float(style))
        _us(p, "u_atlas_exag", float(atlas_exag))
        _us(p, "u_fp4k", float(self.W) / 3840.0)
        self._style = float(style)
        _us(p, "u_contour_m", float(contour_m))
        _us(p, "u_detail", float(detail))
        _us(p, "u_snow_boost", float(snow_boost))
        _us(p, "u_sun_scale", float(sun_scale))
        _us(p, "u_tint", tuple(float(v) for v in sun_tint))
        _us(p, "u_noise_gs", float(self.noise_gs))
        _us(p, "u_sky_boost", float(sky_boost))
        _us(p, "u_sun_disk", float(sun_disk))
        _us(p, "u_stars", float(stars))
        c = clouds or {}
        _us(p, "u_cl_on", 1.0 if clouds else 0.0)
        _us(p, "u_cl_base", float(c.get("base", 5000.0)))
        _us(p, "u_cl_thick", float(c.get("thick", 600.0)))
        _us(p, "u_cl_cov", float(c.get("cov", 0.6)))
        _us(p, "u_cl_scale", float(c.get("scale", 6000.0)))
        _us(p, "u_cl_off", tuple(float(v) for v in c.get("off", (0.0, 0.0))))
        f = fog or {}
        _us(p, "u_fog_dens", float(f.get("dens", 0.0)))
        _us(p, "u_fog_h", float(f.get("h", 3000.0)))
        _us(p, "u_fog_fall", float(f.get("fall", 400.0)))
        self.shade_vao.render(moderngl.TRIANGLE_STRIP)
        return self.finish(grade or {}, exposure, return_aux)

    def visible_chunks(self, scene, cam, vp):
        draws = []
        cx, cy, cz = cam.pos
        for m in scene["vaos"]:
            bb = m["bb"]
            x0, x1, y0, y1, z0, z1 = (bb[:, i] for i in range(6))
            dxn = np.maximum(0, np.maximum(x0 - cx, cx - x1))
            dyn = np.maximum(0, np.maximum(y0 - cy, cy - y1))
            dmin2 = dxn ** 2 + dyn ** 2
            dxf = np.maximum(np.abs(x0 - cx), np.abs(x1 - cx))
            dyf = np.maximum(np.abs(y0 - cy), np.abs(y1 - cy))
            dmax2 = dxf ** 2 + dyf ** 2
            zlo = z0 - cz - dmax2 / (2 * R_EFF) - 5.0
            zhi = z1 - cz - dmin2 / (2 * R_EFF) + 5.0
            xs = np.stack([x0 - cx, x1 - cx], 1)
            ys = np.stack([y0 - cy, y1 - cy], 1)
            zs = np.stack([zlo, zhi], 1)
            corners = np.stack(np.meshgrid([0, 1], [0, 1], [0, 1], indexing="ij"), -1).reshape(-1, 3)
            P = np.stack([xs[:, corners[:, 0]], ys[:, corners[:, 1]], zs[:, corners[:, 2]],
                          np.ones((len(bb), 8))], -1)
            clip = P @ vp.T
            x, y, z, w = clip[..., 0], clip[..., 1], clip[..., 2], clip[..., 3]
            out = ((x < -w).all(1) | (x > w).all(1) | (y < -w).all(1) | (y > w).all(1)
                   | (z < -w).all(1) | (z > w).all(1))
            vis = np.flatnonzero(~out)
            if len(vis) == 0:
                continue
            ch = []
            for j in vis:
                first, count, _ = m["chunks"][j]
                if ch and ch[-1][0] + ch[-1][1] == first:
                    ch[-1] = (ch[-1][0], ch[-1][1] + count)
                else:
                    ch.append((first, count))
            draws.append((m, ch))
        return draws

    def finish(self, grade, exposure, return_aux=False):
        ctx = self.ctx
        g = dict(DEFAULT_GRADE)
        g.update(grade)
        if exposure is not None:
            g["exposure"] = exposure
        bw, bh = self.W // 4, self.H // 4
        bp = self.blur_prog
        self.bloom_fa.use()
        self.hdr.use(0)
        bp["t_src"] = 0
        bp["u_dir"] = (1.0 / self.W * 2.0, 0.0)
        bp["u_thresh"] = float(g["bloom_thresh"])
        self.blur_vao.render(moderngl.TRIANGLE_STRIP)
        for _ in range(2):
            self.bloom_fb.use()
            self.bloom_a.use(0)
            bp["u_dir"] = (0.0, 1.0 / bh * 1.5)
            bp["u_thresh"] = 0.0
            self.blur_vao.render(moderngl.TRIANGLE_STRIP)
            self.bloom_fa.use()
            self.bloom_b.use(0)
            bp["u_dir"] = (1.0 / bw * 1.5, 0.0)
            self.blur_vao.render(moderngl.TRIANGLE_STRIP)
        self.out_fbo.use()
        pp = self.post_prog
        self.hdr.use(0)
        self.bloom_a.use(1)
        pp["t_hdr"] = 0
        pp["t_bloom"] = 1
        for k in ("exposure", "bloom", "sat", "contrast", "vignette"):
            _us(pp, f"u_{k}", float(g[k]))
        for k in ("lift", "gamma", "gain", "shadow_tint", "high_tint"):
            _us(pp, f"u_{k}", tuple(float(v) for v in g[k]))
        _us(pp, "u_res", (float(self.W), float(self.H)))
        self.atlas_tex.use(2)
        _us(pp, "t_atlas", 2)
        _us(pp, "u_style", getattr(self, "_style", 0.0))
        self.post_vao.render(moderngl.TRIANGLE_STRIP)
        img = np.frombuffer(self.out_tex.read(), np.float16).reshape(self.H, self.W, 4)[::-1, :, :3]
        if return_aux:
            aux = np.frombuffer(self.aux.read(), np.float32).reshape(self.H, self.W, 4)[::-1]
            return img.astype(np.float32), aux
        return img.astype(np.float32)


def _us(prog, name, value):
    if name in prog:
        prog[name] = value


def _uw(prog, name, data):
    if name in prog:
        prog[name].write(data)


DEFAULT_GRADE = {
    "exposure": 3.2, "bloom": 0.06, "bloom_thresh": 1.2, "sat": 1.12, "contrast": 1.04,
    "lift": (0.012, 0.016, 0.022), "gamma": (1.0, 1.0, 1.0), "gain": (1.0, 1.0, 1.0),
    "shadow_tint": (-0.006, 0.0, 0.012), "high_tint": (0.012, 0.004, -0.010), "vignette": 0.22,
}
