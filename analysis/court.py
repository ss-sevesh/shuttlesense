"""Manual pixel-to-normalized singles court mapping, independent of the demo UI."""
import cv2
import numpy as np


def calibrate(corners, *, min_area_px2=100):
    """Corners: far-left, far-right, near-right, near-left in decoded pixels."""
    points = np.asarray(corners, dtype=np.float32)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise ValueError("Expected four finite court corners")
    if not np.isfinite(min_area_px2) or min_area_px2 <= 0:
        raise ValueError("min_area_px2 must be positive")
    if not cv2.isContourConvex(points) or cv2.contourArea(points, oriented=True) < min_area_px2:
        raise ValueError("Court corners must form a clockwise convex area in image coordinates")
    target = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(points, target)
    if not np.isfinite(matrix).all() or np.linalg.matrix_rank(matrix) != 3:
        raise ValueError("Degenerate court calibration")
    return matrix


def project(matrix, foot_px, side):
    """x increases toward player's right; y from opponent baseline to own baseline.

    Coordinates outside [0, 1] are retained: do not clamp off-court movement.
    """
    matrix = np.asarray(matrix, dtype=np.float64)
    point = np.asarray(foot_px, dtype=np.float64)
    if (matrix.shape != (3, 3) or point.shape != (2,) or
            not np.isfinite(matrix).all() or not np.isfinite(point).all()):
        raise ValueError("Expected a finite matrix and foot point")
    if side not in ("near", "far"):
        raise ValueError("Unknown orientation: abstain from court-relative mapping")
    homogeneous = matrix @ np.append(point, 1)
    if abs(homogeneous[2]) < 1e-10:
        raise ValueError("Point cannot be projected onto the court plane")
    result = homogeneous[:2] / homogeneous[2]
    if not np.isfinite(result).all():
        raise ValueError("Invalid projection")
    return result if side == "near" else 1 - result


def project_contact(matrix, foot_px, side, contact_status):
    """Project a reviewed grounded point; uncertain/airborne frames stay missing."""
    if contact_status in ("airborne", "uncertain", "occluded"):
        return None
    if contact_status != "grounded":
        raise ValueError("Unknown contact status")
    return project(matrix, foot_px, side)


def project_foot_midpoint(matrix, shoes_px, side, contact_status):
    """Midpoint on the court, only when both shoe contacts are reviewed grounded."""
    if contact_status in ("one_grounded", "airborne", "uncertain", "occluded"):
        return None
    if contact_status != "both_grounded":
        raise ValueError("Unknown two-shoe contact status")
    shoes = np.asarray(shoes_px, dtype=np.float64)
    if shoes.shape != (2, 2) or not np.isfinite(shoes).all():
        raise ValueError("Expected two finite shoe contact points")
    # Perspective does not preserve midpoints: map each floor contact first.
    return (project(matrix, shoes[0], side) + project(matrix, shoes[1], side)) / 2


def reference_error_m(matrix, pixel, expected_xy, court_size_m):
    """Independent floor landmark residual, using global near-side coordinates."""
    expected = np.asarray(expected_xy, dtype=np.float64)
    size = np.asarray(court_size_m, dtype=np.float64)
    if (expected.shape != (2,) or size.shape != (2,) or not np.isfinite(expected).all()
            or not np.isfinite(size).all() or np.any(size <= 0)):
        raise ValueError("Expected finite reference coordinates and positive court dimensions")
    return float(np.linalg.norm((project(matrix, pixel, "near") - expected) * size))
