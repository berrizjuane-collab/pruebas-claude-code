"""Geodesy helpers: local East-North-Up frame centred on the K2 summit."""
import numpy as np

LAT0, LON0 = 35.8825, 76.5133      # K2 summit (WGS84)
SUMMIT_ALT = 8611.0
R_EARTH = 6371000.0


def m_per_deg(lat):
    p = np.radians(lat)
    mlat = 111132.92 - 559.82 * np.cos(2 * p) + 1.175 * np.cos(4 * p)
    mlon = 111412.84 * np.cos(p) - 93.5 * np.cos(3 * p) + 0.118 * np.cos(5 * p)
    return mlat, mlon


MLAT, MLON = m_per_deg(LAT0)


def ll_to_en(lat, lon):
    """lat/lon (deg) -> local east/north metres (equirectangular about the summit)."""
    return (np.asarray(lon) - LON0) * MLON, (np.asarray(lat) - LAT0) * MLAT


def en_to_ll(e, n):
    return LAT0 + np.asarray(n) / MLAT, LON0 + np.asarray(e) / MLON
