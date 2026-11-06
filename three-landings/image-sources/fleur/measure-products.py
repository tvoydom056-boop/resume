"""Measure product extents without counting the warm paper / faint contact shadow.

Run from three-landings: python image-sources/fleur/measure-products.py FILE ...
Uses a per-cell background plane fitted to its outer 3% (paper lighting varies),
then RGB distance > 32, a 5px median filter, and ignores rows/columns with < 1%
foreground. Reports bbox width/height as percentages of each equal square cell.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def measure(filename):
    image = Image.open(filename).convert('RGB')
    cells = []
    for q, (col, row) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1)), 1):
        w, h = image.width // 2, image.height // 2
        cell = np.asarray(image.crop((col*w, row*h, (col+1)*w, (row+1)*h)), dtype=float)
        yy, xx = np.mgrid[:h, :w]
        design = np.stack((np.ones_like(xx), xx / w, yy / h), axis=-1)
        border = (xx < w*.03) | (xx > w*.97) | (yy < h*.03) | (yy > h*.97)
        fit = np.linalg.lstsq(design[border], cell[border], rcond=None)[0]
        distance = np.linalg.norm(cell - design @ fit, axis=-1)
        mask = np.asarray(Image.fromarray((distance > 32).astype('uint8')*255).filter(ImageFilter.MedianFilter(5))) > 0
        xs = np.flatnonzero(mask.sum(axis=0) > h*.01)
        ys = np.flatnonzero(mask.sum(axis=1) > w*.01)
        if not xs.size or not ys.size:
            raise ValueError(f'No foreground: {filename} q{q}')
        bbox = [int(xs[0]), int(ys[0]), int(xs[-1]+1), int(ys[-1]+1)]
        cells.append(dict(q=f'q{q}', bbox=bbox, width_pct=round((bbox[2]-bbox[0])/w*100, 1), height_pct=round((bbox[3]-bbox[1])/h*100, 1)))
    return dict(file=str(filename), size=list(image.size), cells=cells)


if __name__ == '__main__':
    print(json.dumps([measure(Path(name)) for name in sys.argv[1:]], ensure_ascii=False, indent=2))
