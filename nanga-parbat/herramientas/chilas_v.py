import sys
sys.path.insert(0, sys.argv[1])
import piedras
from PIL import Image
spec = dict(piedras.STONES["chilas"])
spec.update(size=(1100, 1500), seed=313, pad=(0.05, 0.04, 0.06, 0.07),
            carve=[("ibex", 0.66, 0.80, 0.11, 0.0), ("stupa", 0.86, 0.87, 0.07), ("ibex", 0.30, 0.86, 0.065, -0.05)],
            text=(0.13, 0.11, 0.87, 0.70))
rgba, box, txt = piedras.render(spec, 1.0)
Image.fromarray(rgba, "RGBA").save(sys.argv[2], "WEBP", quality=84, method=6, alpha_quality=88)
print(box, txt)
