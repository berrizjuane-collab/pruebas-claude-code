"""HTTP minimo (urllib) que respeta el proxy y la CA del entorno."""
import os
import ssl
import time
import urllib.request

_ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE", "/root/.ccr/ca-bundle.crt")
                                  if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
_handlers = [urllib.request.HTTPSHandler(context=_ctx)]
if os.environ.get("HTTPS_PROXY"):
    _handlers.append(urllib.request.ProxyHandler({"https": os.environ["HTTPS_PROXY"]}))
_opener = urllib.request.build_opener(*_handlers)


def get(url, retries=4, timeout=60, headers=None):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {"User-Agent": "ochomiles-film/1.0"})
            with _opener.open(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"GET failed {url}: {last}")
