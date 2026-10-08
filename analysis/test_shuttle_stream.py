"""Compare streaming overlap averaging against a complete offline accumulator."""
import unittest

import numpy as np

import cv2
from shuttle_stream import average_windows, frame_windows


class StreamTests(unittest.TestCase):
    def test_every_frame_average_matches_full_accumulator_including_tails(self):
        for frames in (8, 9, 10, 11, 12, 15, 31, 100):
            for batch_size in (1, 2, 4, 7):
                heatmaps = np.arange((frames - 7) * 8 * 6, dtype=np.float32).reshape(frames - 7, 8, 2, 3)
                total = np.zeros((frames, 2, 3), dtype=np.float32)
                counts = np.zeros(frames)
                for start, heatmap in enumerate(heatmaps):
                    total[start:start + 8] += heatmap
                    counts[start:start + 8] += 1
                actual = list(average_windows(enumerate(heatmaps), lambda batch: np.stack(batch), batch_size=batch_size))
                self.assertEqual([i for i, _ in actual], list(range(frames)))
                np.testing.assert_allclose(np.stack([v for _, v in actual]), total / counts[:, None, None], atol=1e-5)

    def test_missing_window_and_nonfinite_predictions_are_rejected(self):
        h = np.zeros((8, 2, 3), dtype=np.float32)
        for windows in ([], [(1, h)], [(0, h), (2, h)], [(0, h * float('nan'))]):
            with self.assertRaises(ValueError):
                list(average_windows(windows, lambda batch: np.stack(batch)))

    def test_input_generator_is_consumed_incrementally(self):
        consumed = []

        def windows():
            for i in range(1000):
                consumed.append(i)
                yield i, np.ones((8, 2, 3), dtype=np.float32)

        output = average_windows(windows(), lambda batch: np.stack(batch), batch_size=4)
        self.assertEqual(next(output)[0], 0)
        self.assertEqual(len(consumed), 4)
        output.close()

    def test_frame_windows_validate_cfr_and_preserve_window_indices(self):
        class Capture:
            def __init__(self, drift=0):
                self.index = 0
                self.drift = drift

            def read(self):
                self.index += 1
                return self.index <= 10, np.zeros((2, 3, 3), dtype=np.uint8)

            def get(self, key):
                return ((self.index - 1) / 30 + self.drift) * 1000

        background = np.zeros((3, 2, 3), dtype=np.uint8)
        channels = lambda rgb: np.moveaxis(rgb, -1, 0)
        windows = list(frame_windows(Capture(), background, channels, 30))
        self.assertEqual([i for i, _ in windows], [0, 1, 2])
        self.assertEqual(windows[0][1].shape, (27, 2, 3))
        with self.assertRaises(ValueError):
            list(frame_windows(Capture(drift=.1), background, channels, 30))


if __name__ == '__main__':
    unittest.main()
