"""Escritura de PNG sin pérdidas (8 y 16 bits) con zlib puro.

Se evita Pillow para los datos porque su soporte de PNG de 16 bits en escala de
grises depende de la versión; aquí el formato queda bajo control y la app lo
decodifica con su propio lector (src/data/png.ts).
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _filter_rows(raw: np.ndarray, bpp: int) -> bytes:
    """Filtro adaptativo por fila (None/Sub/Up/Paeth) eligiendo la menor suma absoluta."""
    h, rowlen = raw.shape
    out = bytearray()
    prev = np.zeros(rowlen, dtype=np.int16)
    for i in range(h):
        row = raw[i].astype(np.int16)
        left = np.concatenate([np.zeros(bpp, np.int16), row[:-bpp]])
        upleft = np.concatenate([np.zeros(bpp, np.int16), prev[:-bpp]])
        cands = {
            0: row,
            1: (row - left) & 0xFF,
            2: (row - prev) & 0xFF,
        }
        p = left + prev - upleft
        pa = np.abs(p - left)
        pb = np.abs(p - prev)
        pc = np.abs(p - upleft)
        pred = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, upleft))
        cands[4] = (row - pred) & 0xFF
        best = min(cands, key=lambda k: int(np.abs(cands[k].astype(np.int8).astype(np.int16)).sum()))
        out.append(best)
        out += cands[best].astype(np.uint8).tobytes()
        prev = row
    return bytes(out)


def write_png(path: Path, arr: np.ndarray) -> None:
    """arr: (h, w) uint16/uint8 en gris o (h, w, 3|4) uint8."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if arr.ndim == 2 and arr.dtype == np.uint16:
        h, w = arr.shape
        raw = arr.astype(">u2").view(np.uint8).reshape(h, w * 2)
        color_type, depth, bpp = 0, 16, 2
    elif arr.ndim == 2 and arr.dtype == np.uint8:
        h, w = arr.shape
        raw = arr
        color_type, depth, bpp = 0, 8, 1
    elif arr.ndim == 3 and arr.dtype == np.uint8 and arr.shape[2] in (3, 4):
        h, w, c = arr.shape
        raw = arr.reshape(h, w * c)
        color_type, depth, bpp = (2 if c == 3 else 6), 8, c
    else:
        raise ValueError(f"formato no soportado: {arr.dtype} {arr.shape}")
    ihdr = struct.pack(">IIBBBBB", w, h, depth, color_type, 0, 0, 0)
    data = zlib.compress(_filter_rows(np.ascontiguousarray(raw), bpp), 9)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(_chunk(b"IHDR", ihdr))
        f.write(_chunk(b"IDAT", data))
        f.write(_chunk(b"IEND", b""))
