"""Master timeline (seconds).  Narration drives the cut; every shot, label and music cue
is keyed to the line that describes it."""

FPS = 24
DURATION = 56.0
NFRAMES = int(round(DURATION * FPS))

# narration line starts (durations come from the rendered takes)
LINE_START = [0.80, 7.10, 13.70, 19.30, 27.40, 33.50, 43.00, 49.70]

# shots: name, start, end
SHOTS = [
    ('basecamp',   0.00,  6.60),
    ('spur',       6.60, 13.20),
    ('chimney',   13.20, 19.00),
    ('pyramid',   19.00, 27.00),
    ('shoulder',  27.00, 33.00),
    ('bottleneck', 33.00, 38.80),
    ('traverse',  38.80, 44.40),
    ('ridge',     44.40, 48.20),
    ('summit',    48.20, 51.20),
    ('pullback',  51.20, DURATION),
]

# transitions between consecutive shots: (kind, duration)
TRANSITIONS = {
    'basecamp>spur': ('continuous', 0.0),
    'spur>chimney': ('paint', 0.8),
    'chimney>pyramid': ('paint', 0.7),
    'pyramid>shoulder': ('paint', 0.8),
    'shoulder>bottleneck': ('paint', 0.9),
    'bottleneck>traverse': ('paint', 0.7),
    'traverse>ridge': ('paint', 0.8),
    'ridge>summit': ('paint', 0.5),
    'summit>pullback': ('continuous', 0.0),
}

# on-screen labels: title, subtitle (altitude), start, end, anchor (world waypoint name)
LABELS = [
    ('Campo Base', '≈ 5.150 m', 1.0, 4.4, 'Campo Base'),
    ('Chimenea de House', '≈ 6.600 m', 13.9, 18.2, 'Chimenea de House'),
    ('Pirámide Negra', '≈ 6.700 – 7.400 m', 19.7, 25.6, 'Pirámide Negra'),
    ('Hombro', 'Campamento IV · ≈ 7.900 m', 27.6, 32.4, 'C4'),
    ('Bottleneck', '≈ 8.200 m', 33.7, 38.4, 'Bottleneck'),
    ('Cumbre · 8.611 m', '', 48.3, 51.6, 'Cumbre'),
]


def shot_at(t):
    for name, a, b in SHOTS:
        if a <= t < b:
            return name, a, b
    return SHOTS[-1]
