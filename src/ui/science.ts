/**
 * Static science content for the info panel. Written to be rigorous but readable;
 * uncertainty is stated where it is real, and speculative ideas are marked.
 */

export interface Article {
  title: string;
  body: string; // simple HTML (paragraphs / lists)
}

export const ARTICLES: Article[] = [
  {
    title: 'What is a neutron star?',
    body: `<p>A neutron star is the collapsed core left behind when a massive star
    (roughly 8–25 solar masses) explodes as a supernova. Gravity crushes about
    1.4 solar masses into a sphere only ~20–25 km across. The result is the
    densest directly observable matter in the Universe — a teaspoon would weigh
    billions of tonnes.</p>`,
  },
  {
    title: 'Formation & collapse',
    body: `<p>When a massive star exhausts its nuclear fuel, its iron core can no
    longer support itself. It collapses in under a second; electrons and protons
    merge into neutrons, releasing a torrent of neutrinos. The infalling outer
    layers bounce off the ultra-stiff core and are blown away as a
    <em>supernova</em>. What remains — if the core is below the mass limit for a
    black hole — is a neutron star.</p>`,
  },
  {
    title: 'Degeneracy pressure & the strong force',
    body: `<p>A neutron star is held up not by heat but by <em>neutron degeneracy
    pressure</em> — the quantum-mechanical resistance of neutrons to being packed
    into the same state (the Pauli exclusion principle) — strongly assisted by the
    repulsive core of the nuclear strong interaction at short range. Without the
    strong force's contribution, the maximum mass would be far lower than
    observed.</p>`,
  },
  {
    title: 'Equation of state & the TOV limit',
    body: `<p>The relationship between pressure and density in ultra-dense matter
    is the <em>equation of state</em> (EoS), and it is not fully known. Feeding an
    EoS into the relativistic Tolman–Oppenheimer–Volkoff (TOV) equation gives the
    star's structure and a <em>maximum mass</em> (~2.2–2.3 solar masses for most
    modern EoS). Above it, no known pressure can prevent collapse to a black
    hole. This visualization does not solve the TOV equation in real time — the
    interior view is a schematic.</p>`,
  },
  {
    title: 'Crust, superfluidity & superconductivity',
    body: `<p>Beneath a paper-thin atmosphere lies a crystalline <em>crust</em> of
    neutron-rich nuclei. Deeper still, neutrons drip out of nuclei and are thought
    to form a <em>superfluid</em>, while protons form a <em>superconductor</em>.
    Sudden re-couplings of the superfluid to the crust may cause pulsar
    "glitches" — abrupt tiny spin-ups.</p>`,
  },
  {
    title: 'Pulsars',
    body: `<p>Many neutron stars are <em>pulsars</em>: their magnetic axis is
    tilted from their spin axis, so their beamed radiation sweeps space like a
    lighthouse. If a beam crosses Earth we see a pulse once (or twice) per
    rotation — from once every few seconds down to hundreds of times per second
    for recycled millisecond pulsars.</p>`,
  },
  {
    title: 'Magnetars & extreme fields',
    body: `<p>Magnetars have the strongest magnetic fields known — up to
    ~10¹¹ T (10¹⁵ G), a thousand times a typical pulsar. Decay of this field can
    fracture the crust and power giant X-ray and gamma-ray flares. The surface
    "starquake" activity shown here is a stylised illustration, not a simulation
    of a specific event.</p>`,
  },
  {
    title: 'Spin-down: losing rotational energy',
    body: `<p>A rotating, oblique magnet radiates electromagnetic energy, so a
    pulsar gradually spins down. The energy comes from its enormous rotational
    kinetic energy reservoir. The measured slow-down, combined with the magnetic-
    dipole model, yields the field strength and a rough "characteristic age".</p>`,
  },
  {
    title: 'Light bending & gravitational redshift',
    body: `<p>Neutron stars are so compact that spacetime near them is strongly
    curved. Light leaving the surface is <em>gravitationally redshifted</em>, and
    rays are bent so much that you can see <em>more than a full hemisphere</em> of
    the surface at once. Clocks on the surface also run measurably slower than
    distant clocks (gravitational time dilation). The lensing here is an
    approximation, not a full geodesic ray trace.</p>`,
  },
  {
    title: 'Not a black hole',
    body: `<p>A neutron star has a real, visible surface and its radius stays
    <em>above</em> its Schwarzschild radius (compactness below ½; in practice
    below the Buchdahl limit of 4/9). It emits light we can see and analyse. A
    black hole, by contrast, has an event horizon and no surface. This app keeps
    the star strictly on the neutron-star side of that boundary.</p>`,
  },
  {
    title: 'Why the sound is a sonification',
    body: `<p>Space is a vacuum: no acoustic sound travels from a neutron star to
    us. The audio here is a <em>sonification</em> — the pulsar's periodic signal
    mapped into the audible range, one click per beam crossing, with pitch scaled
    from the real spin rate. The cinematic drone is explicitly an artistic layer,
    not data.</p>`,
  },
];
