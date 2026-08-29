"""Render Umbrel App Store gallery images (2880x1800) for Popcorn Vote.

Shared background across all slides: deep navy from the logo, a cool glow top
right and a warm popcorn glow bottom left. Screenshots (3x iPhone captures of
the demo instance, see shoot.mjs) sit in rounded phone frames with soft
shadows; headline + subline in Nunito Sans, the website's face.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np
import pathlib, sys

HERE = pathlib.Path(__file__).parent
ASSETS = HERE.parent / 'website' / 'assets'
SHOTS = HERE / 'shots'
OUT = HERE
OUT.mkdir(exist_ok=True)

W, H = 2880, 1800
NAVY = (8, 22, 78)
NAVY_DEEP = (4, 12, 48)
CREAM = (255, 253, 248)
MUTED = (174, 185, 205)
FONT = str(HERE / 'nunito-sans.ttf')  # converted from ../website/assets/fonts, see README


def font(size, weight=800):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight, 12])
    return f


def background():
    grad = Image.new('RGB', (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel((0, y), tuple(int(NAVY[i] * (1 - t) + NAVY_DEEP[i] * t) for i in range(3)))
    bg = grad.resize((W, H))
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-400, 900, 1300, 2400), fill=(70, 48, 8))
    gd.ellipse((1900, -600, 3400, 700), fill=(16, 50, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(320))
    bg = Image.fromarray(np.clip(np.asarray(bg, dtype='int16') + np.asarray(glow, dtype='int16'), 0, 255).astype('uint8'))
    return bg.convert('RGBA')


def shadow_layer(size, radius, offset=(0, 40), blur=60, alpha=140):
    w, h = size
    pad = blur * 3
    layer = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((pad, pad, pad + w, pad + h), radius, fill=(0, 0, 0, alpha))
    return layer.filter(ImageFilter.GaussianBlur(blur)), pad, offset


def phone(shot_path, height, radius=None, bezel=None):
    """An RGBA phone frame holding the screenshot scaled to `height`."""
    shot = Image.open(shot_path).convert('RGB')
    sw, sh = shot.size
    scale = height / sh
    shot = shot.resize((round(sw * scale), height), Image.LANCZOS)
    bezel = bezel or round(height * 0.014)
    radius = radius or round(height * 0.075)
    fw, fh = shot.width + bezel * 2, shot.height + bezel * 2
    frame = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((0, 0, fw - 1, fh - 1), radius, fill=(22, 24, 30, 255))
    d.rounded_rectangle((3, 3, fw - 4, fh - 4), radius - 3, outline=(70, 74, 86, 255), width=2)
    mask = Image.new('L', shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), radius - bezel, fill=255)
    frame.paste(shot, (bezel, bezel), mask)
    return frame


def paste_with_shadow(bg, img, xy, blur=70, alpha=150, offset=(0, 50)):
    sh, pad, off = shadow_layer(img.size, 60, offset, blur, alpha)
    bg.alpha_composite(sh, (xy[0] - pad + off[0], xy[1] - pad + off[1]))
    bg.alpha_composite(img, xy)


def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def text_block(bg, x, y, headline, sub, maxw, hl_size=140, sub_size=62, align='left', color=CREAM):
    d = ImageDraw.Draw(bg)
    hf, sf = font(hl_size, 800), font(sub_size, 500)
    yy = y
    for ln in wrap(d, headline, hf, maxw):
        w = d.textlength(ln, font=hf)
        xx = x if align == 'left' else x - w / 2 if align == 'center' else x - w
        d.text((xx, yy), ln, font=hf, fill=color)
        yy += hl_size * 1.12
    yy += 30
    for ln in wrap(d, sub, sf, maxw):
        w = d.textlength(ln, font=sf)
        xx = x if align == 'left' else x - w / 2 if align == 'center' else x - w
        d.text((xx, yy), ln, font=sf, fill=MUTED)
        yy += sub_size * 1.4
    return yy


def key_navy(logo):
    """Make the logo's navy square transparent so it floats on the background."""
    a = np.asarray(logo).astype('int16')
    dist = np.abs(a[..., :3] - np.array(NAVY)).sum(axis=-1)
    alpha = np.clip((dist - 18) * 12, 0, 255).astype('uint8')
    a[..., 3] = np.minimum(a[..., 3], alpha)
    return Image.fromarray(a.astype('uint8'), 'RGBA')


def slide_hero():
    bg = background()
    logo = Image.open(ASSETS / 'popcorn-vote-icon-512.png').convert('RGBA').resize((560, 560), Image.LANCZOS)
    bg.alpha_composite(key_navy(logo), (260, 380))
    ImageDraw.Draw(bg).text((260, 980), 'Popcorn Vote', font=font(190, 800), fill=CREAM)
    text_block(bg, 262, 1210, '', 'Settle movie night fairly, with a vote instead of an argument.', 1200, sub_size=68)
    p1 = phone(SHOTS / 'list.png', 1560)
    p2 = phone(SHOTS / 'winner.png', 1240)
    paste_with_shadow(bg, p1, (1560, 120))
    paste_with_shadow(bg, p2, (2140, 440))
    return bg


def slide_two(shot, headline, sub, shot2=None, flip=False):
    bg = background()
    p = phone(SHOTS / shot, 1420)
    p2 = phone(SHOTS / shot2, 1060) if shot2 else None
    text_w = 980
    if flip:
        px = 200
        paste_with_shadow(bg, p, (px, 190))
        if p2:
            paste_with_shadow(bg, p2, (px + p.width - 200, 470))
        text_block(bg, W - 220, 480, headline, sub, text_w, align='right')
    else:
        px = W - 200 - p.width
        if p2:
            paste_with_shadow(bg, p2, (px - p2.width + 200, 470))
        paste_with_shadow(bg, p, (px, 190))
        text_block(bg, 220, 480, headline, sub, text_w)
    return bg


def slide_tv():
    bg = background()
    tv = Image.open(SHOTS / 'tv.png').convert('RGB')
    tv = tv.resize((2080, round(2080 * tv.height / tv.width)), Image.LANCZOS)
    frame = Image.new('RGBA', (tv.width + 40, tv.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), 48, fill=(22, 24, 30, 255))
    mask = Image.new('L', tv.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tv.width - 1, tv.height - 1), 28, fill=255)
    frame.paste(tv, (20, 20), mask)
    text_block(bg, W // 2, 150, 'Tonight’s movie, on the big screen',
               'A TV mode shows the winner in full: poster, runtime, genres and how it was chosen.',
               2400, hl_size=120, sub_size=56, align='center')
    paste_with_shadow(bg, frame, ((W - frame.width) // 2, 520))
    return bg


SLIDES = [
    ('1', slide_hero),
    ('2', lambda: slide_two('list.png', 'Everyone gets one vote a week',
                             'Suggest films, spend your votes, save them up — the film only one person is longing for eventually gets its turn.',
                             shot2='search.png')),
    ('3', lambda: slide_two('wheel.png', 'A tie? The wheel decides',
                             'Press Reveal before movie night: most votes win, a wheel of fortune settles a tie, and the winner is announced with a burst of popcorn.',
                             shot2='winner.png', flip=True)),
    ('4', slide_tv),
    ('5', lambda: slide_two('archive.png', 'A shared family film diary',
                             'Watched films go into the archive with everyone’s star ratings. Set up in the browser, in nine languages; one SQLite file holds everything.',
                             shot2='more.png')),
]

if __name__ == '__main__':
    which = sys.argv[1:] or [n for n, _ in SLIDES]
    for name, fn in SLIDES:
        if name in which:
            img = fn().convert('RGB')
            img.save(OUT / f'{name}.jpg', quality=92, subsampling=0)
            pass
            print('wrote', name)
