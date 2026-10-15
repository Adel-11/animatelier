import cv2, sys, json, os
import numpy as np
# Recadre une photo en carré tête + épaules et renvoie le point focal des yeux (0-1).
cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
eyec = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")

def process(path, out, size=900, span=1.75):
    im = cv2.imread(path)
    if im is None: return None
    h, w = im.shape[:2]
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    faces = cas.detectMultiScale(g, 1.1, 6, minSize=(max(40, w // 20), max(40, h // 20)))
    if len(faces) == 0: return None
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    # yeux : détection dans le haut du visage, sinon 40 % de la hauteur du visage
    roi = g[y:y + int(fh * 0.6), x:x + fw]
    eyes = eyec.detectMultiScale(roi, 1.1, 6)
    if len(eyes) >= 2:
        eyes = sorted(eyes, key=lambda e: -e[2] * e[3])[:2]
        ex = x + sum(e[0] + e[2] / 2 for e in eyes) / 2
        ey = y + sum(e[1] + e[3] / 2 for e in eyes) / 2
    else:
        ex, ey = x + fw / 2, y + fh * 0.42
    side = min(int(fh * span), h, w)
    cx, cy = x + fw / 2, y + fh * 0.55
    left = int(min(max(0, cx - side / 2), w - side))
    top = int(min(max(0, cy - side / 2), h - side))
    crop = im[top:top + side, left:left + side]
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    cv2.imwrite(out, crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return {"focusX": round((ex - left) / side, 3), "focusY": round((ey - top) / side, 3),
            "faceRatio": round(fh / side, 3)}

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    res = {}
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        k = os.path.splitext(f)[0]
        r = process(os.path.join(src, f), os.path.join(dst, k + ".jpg"))
        res[k] = r
        print(k, r)
    json.dump(res, open(os.path.join(dst, "focus.json"), "w"), indent=1)
