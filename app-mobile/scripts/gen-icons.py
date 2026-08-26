"""
Gera os assets de icone/splash do app-mobile a partir do logo-mascote oficial
(venancio-ai-ops/public/logo-mascote.png).

Uso pontual (T3.2 - identidade de build). Nao faz parte do pipeline de build;
pode ser apagado depois de rodado, ou mantido para regerar os assets se o
logo mudar no futuro.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(ROOT)
SRC_LOGO = os.path.join(REPO_ROOT, "venancio-ai-ops", "public", "logo-mascote.png")
ASSETS = os.path.join(ROOT, "assets")

BRAND_BLUE_LIGHT = (230, 244, 254, 255)  # #E6F4FE - ja usado no adaptiveIcon
WHITE = (255, 255, 255, 255)


def load_logo():
    im = Image.open(SRC_LOGO).convert("RGBA")
    return im


def contain(im, box_size, margin_ratio=0.0):
    """Redimensiona 'im' mantendo proporcao para caber em um quadrado
    box_size x box_size, com margem proporcional em cada lado."""
    usable = int(box_size * (1 - 2 * margin_ratio))
    w, h = im.size
    scale = usable / max(w, h)
    new_w, new_h = int(w * scale), int(h * scale)
    return im.resize((new_w, new_h), Image.LANCZOS)


def compose_on_bg(logo, box_size, bg_color, margin_ratio=0.06):
    canvas = Image.new("RGBA", (box_size, box_size), bg_color)
    resized = contain(logo, box_size, margin_ratio)
    x = (box_size - resized.width) // 2
    y = (box_size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def compose_transparent(logo, box_size, margin_ratio):
    canvas = Image.new("RGBA", (box_size, box_size), (0, 0, 0, 0))
    resized = contain(logo, box_size, margin_ratio)
    x = (box_size - resized.width) // 2
    y = (box_size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def monochrome_white(logo, box_size, margin_ratio):
    """Icone monocromatico (Android 13+ themed icon): silhueta branca com o
    alpha do logo original, sobre fundo transparente."""
    resized = contain(logo, box_size, margin_ratio)
    alpha = resized.getchannel("A")
    white_rgba = Image.new("RGBA", resized.size, (255, 255, 255, 255))
    white_rgba.putalpha(alpha)
    canvas = Image.new("RGBA", (box_size, box_size), (0, 0, 0, 0))
    x = (box_size - resized.width) // 2
    y = (box_size - resized.height) // 2
    canvas.alpha_composite(white_rgba, (x, y))
    return canvas


def main():
    logo = load_logo()
    print("Logo fonte:", SRC_LOGO, logo.size)

    # icon.png - icone principal (iOS + fallback), fundo branco, leve margem
    icon = compose_on_bg(logo, 1024, WHITE, margin_ratio=0.08)
    icon.convert("RGB").save(os.path.join(ASSETS, "icon.png"))

    # android-icon-foreground.png - fundo transparente, dentro da "safe zone"
    # (~66% do canvas) para nao ser cortado pela mascara adaptativa.
    fg = compose_transparent(logo, 1024, margin_ratio=0.22)
    fg.save(os.path.join(ASSETS, "android-icon-foreground.png"))

    # android-icon-background.png - cor solida (mesma da config atual)
    bg = Image.new("RGBA", (1024, 1024), BRAND_BLUE_LIGHT)
    bg.save(os.path.join(ASSETS, "android-icon-background.png"))

    # android-icon-monochrome.png - silhueta branca (Android 13+ themed icons)
    mono = monochrome_white(logo, 1024, margin_ratio=0.22)
    mono.save(os.path.join(ASSETS, "android-icon-monochrome.png"))

    # favicon.png - versao pequena para web, fundo branco
    fav = compose_on_bg(logo, 196, WHITE, margin_ratio=0.08)
    fav.save(os.path.join(ASSETS, "favicon.png"))

    # splash-icon.png - fundo transparente, usado pelo plugin expo-splash-screen
    # (a cor de fundo da splash e definida separadamente no app.json)
    splash = compose_transparent(logo, 1024, margin_ratio=0.30)
    splash.save(os.path.join(ASSETS, "splash-icon.png"))

    print("Assets gerados em", ASSETS)


if __name__ == "__main__":
    main()
