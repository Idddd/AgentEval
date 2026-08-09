#!/usr/bin/env python3
"""Generate the landing-page OpenClaw request-flow GIF and static poster."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "apps/control/public/assets/landing"
BRAND_DIR = ROOT / "apps/control/public/assets/brands"
OPENCLAW_LOGO = ROOT / "apps/control/public/assets/brands/openclaw-lobehub.webp"
GIF_PATH = ASSET_DIR / "agent-control-layers.gif"
POSTER_PATH = ASSET_DIR / "agent-control-layers-poster.png"

WIDTH = 1280
HEIGHT = 720
FPS = 10
DURATION_SECONDS = 8

BG = (7, 9, 12)
SURFACE = (11, 14, 19)
SURFACE_HIGH = (14, 18, 24)
RULE = (39, 44, 53)
TEXT = (235, 237, 241)
MUTED = (126, 132, 144)
DIM = (70, 76, 88)
CYAN = (66, 227, 255)
VIOLET = (156, 150, 255)
AMBER = (244, 173, 78)
RED = (255, 91, 103)

MONO_PATH = "/System/Library/Fonts/SFNSMono.ttf"
TEXT_PATH = "/System/Library/Fonts/HelveticaNeue.ttc"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


MONO_8 = font(MONO_PATH, 9)
MONO_9 = font(MONO_PATH, 10)
MONO_10 = font(MONO_PATH, 11)
MONO_11 = font(MONO_PATH, 12)
MONO_12 = font(MONO_PATH, 13)
TEXT_12 = font(TEXT_PATH, 12)
TEXT_14 = font(TEXT_PATH, 14)
TEXT_17 = font(TEXT_PATH, 17)


def mix(a: Sequence[int], b: Sequence[int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(a[index] + (b[index] - a[index]) * amount) for index in range(3))


def fade(color: Sequence[int], amount: float, background: Sequence[int] = BG) -> tuple[int, int, int]:
    return mix(background, color, amount)


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def active_window(t: float, start: float, end: float, edge: float = 0.18) -> float:
    if t < start or t > end:
        return 0.0
    if t < start + edge:
        return ease((t - start) / edge)
    if t > end - edge:
        return ease((end - t) / edge)
    return 1.0


def dashed_line(
    draw: ImageDraw.ImageDraw,
    points: Sequence[tuple[float, float]],
    fill: tuple[int, int, int],
    width: int = 1,
    dash: float = 7,
    gap: float = 7,
) -> None:
    for start, end in zip(points, points[1:]):
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        ux = dx / length
        uy = dy / length
        distance = 0.0
        while distance < length:
            segment_end = min(distance + dash, length)
            draw.line(
                (
                    start[0] + ux * distance,
                    start[1] + uy * distance,
                    start[0] + ux * segment_end,
                    start[1] + uy * segment_end,
                ),
                fill=fill,
                width=width,
            )
            distance += dash + gap


def point_on_polyline(points: Sequence[tuple[float, float]], amount: float) -> tuple[float, float]:
    amount = max(0.0, min(1.0, amount))
    lengths = [math.dist(start, end) for start, end in zip(points, points[1:])]
    total = sum(lengths)
    target = total * amount
    walked = 0.0
    for index, length in enumerate(lengths):
        if walked + length >= target:
            local = 0.0 if length == 0 else (target - walked) / length
            start = points[index]
            end = points[index + 1]
            return (
                start[0] + (end[0] - start[0]) * local,
                start[1] + (end[1] - start[1]) * local,
            )
        walked += length
    return points[-1]


def glow_dot(
    draw: ImageDraw.ImageDraw,
    position: tuple[float, float],
    color: tuple[int, int, int],
    radius: int = 4,
    strength: float = 1.0,
) -> None:
    x, y = position
    strength = max(0.0, min(1.0, strength))
    for extra, opacity in ((9, 0.08), (6, 0.14), (3, 0.24)):
        draw.ellipse(
            (x - radius - extra, y - radius - extra, x + radius + extra, y + radius + extra),
            fill=fade(color, opacity * strength),
        )
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill=fade(color, 0.85 * strength + 0.15),
    )


def centered_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    value: str,
    selected_font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
) -> None:
    draw.text(xy, value, font=selected_font, fill=fill, anchor="mm")


def draw_arrowhead(
    draw: ImageDraw.ImageDraw,
    tip: tuple[float, float],
    color: tuple[int, int, int],
    direction: int = 1,
) -> None:
    x, y = tip
    draw.polygon(
        ((x, y), (x - 7 * direction, y - 4), (x - 7 * direction, y + 4)),
        fill=color,
    )


def load_brand_icon(name: str) -> Image.Image:
    return Image.open(BRAND_DIR / name).convert("RGBA")


BRAND_ICONS = {
    "claude-code": load_brand_icon("claude-code-mark.png"),
    "github": load_brand_icon("github-mark.png"),
    "jira": load_brand_icon("jira-mark.png"),
    "confluence": load_brand_icon("confluence-mark.png"),
    "postgresql": load_brand_icon("postgresql-mark.png"),
    "mem0": load_brand_icon("mem0-mark.png"),
    "litellm": load_brand_icon("litellm-train.png"),
    "nvidia": load_brand_icon("nvidia-mark.png"),
    "anthropic": load_brand_icon("anthropic-mark.png"),
}


def brand_icon(name: str, size: int, opacity: float = 1.0) -> Image.Image:
    icon = BRAND_ICONS[name].resize((size, size), Image.Resampling.LANCZOS)
    if opacity < 1.0:
        alpha = icon.getchannel("A").point(lambda value: round(value * opacity))
        icon.putalpha(alpha)
    return icon


def draw_extension_node(
    frame: Image.Image,
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    label: str,
    detail: str,
    logos: Sequence[str],
    intensity: float,
) -> None:
    x, y = center
    outline = fade(VIOLET, 0.22 + 0.58 * intensity)
    fill = mix(SURFACE, VIOLET, 0.035 + 0.07 * intensity)
    draw.ellipse((x - 31, y - 31, x + 31, y + 31), fill=fill, outline=outline, width=1)
    logo_opacity = 0.6 + 0.4 * intensity
    if len(logos) == 1:
        icon = brand_icon(logos[0], 34, logo_opacity)
        frame.paste(icon, (x - 17, y - 17), icon)
    else:
        positions = ((x - 18, y - 9), (x, y + 10), (x + 18, y - 9))
        for name, position in zip(logos, positions):
            icon = brand_icon(name, 19, logo_opacity)
            frame.paste(icon, (position[0] - 9, position[1] - 9), icon)
    centered_text(draw, (x, y + 46), label, MONO_10, fade(TEXT, 0.68 + 0.3 * intensity))
    centered_text(draw, (x, y + 61), detail, MONO_8, fade(MUTED, 0.5 + 0.28 * intensity))


def load_openclaw_logo() -> Image.Image:
    image = Image.open(OPENCLAW_LOGO).convert("RGBA").resize((48, 48), Image.Resampling.LANCZOS)
    pixels = []
    source_pixels = (
        image.get_flattened_data()
        if hasattr(image, "get_flattened_data")
        else image.getdata()
    )
    for red, green, blue, _alpha in source_pixels:
        brightness = max(red, green, blue)
        alpha = 0 if brightness < 10 else min(255, round((brightness - 8) * 1.4))
        pixels.append((red, green, blue, alpha))
    image.putdata(pixels)
    return image


OPENCLAW_ICON = load_openclaw_logo()


def draw_grid(draw: ImageDraw.ImageDraw) -> None:
    grid_color = fade(RULE, 0.25)
    for x in range(532, 1260, 64):
        draw.line((x, 54, x, 670), fill=grid_color, width=1)
    for y in range(84, 670, 64):
        draw.line((512, y, 1260, y), fill=grid_color, width=1)


def draw_openclaw(
    frame: Image.Image,
    draw: ImageDraw.ImageDraw,
    pulse: float,
    response_active: float,
) -> None:
    x, y = 790, 350
    ring = fade(VIOLET, 0.42 + pulse * 0.24)
    draw.ellipse((x - 106, y - 106, x + 106, y + 106), fill=SURFACE, outline=fade(RULE, 0.86), width=1)
    draw.ellipse((x - 91, y - 91, x + 91, y + 91), fill=SURFACE_HIGH, outline=ring, width=1)
    draw.arc((x - 101, y - 101, x + 101, y + 101), 208, 332, fill=fade(CYAN, 0.38 + response_active * 0.52), width=2)
    draw.ellipse((x - 48, y - 53, x + 48, y + 43), fill=(8, 10, 14), outline=fade(RULE, 0.7), width=1)
    frame.paste(OPENCLAW_ICON, (x - 24, y - 45), OPENCLAW_ICON)
    centered_text(draw, (x, y + 24), "OpenClaw", TEXT_17, TEXT)
    centered_text(draw, (x, y + 44), "PRIMARY AGENT", MONO_9, fade(VIOLET, 0.8))
    draw.ellipse((x + 51, y + 59, x + 57, y + 65), fill=CYAN)
    draw.text((x + 63, y + 62), "READY", font=MONO_8, fill=fade(CYAN, 0.75), anchor="lm")
    draw.text((x - 83, y - 73), "ENTRY", font=MONO_8, fill=fade(CYAN, 0.62))


def draw_sub_agent(draw: ImageDraw.ImageDraw, intensity: float) -> None:
    x, y = 920, 175
    fill = mix(SURFACE, VIOLET, 0.025 + intensity * 0.05)
    outline = fade(VIOLET, 0.2 + intensity * 0.62)
    draw.ellipse((x - 39, y - 39, x + 39, y + 39), fill=fill, outline=outline, width=1)
    nodes = ((x, y - 12), (x - 13, y + 11), (x + 13, y + 11))
    draw.line((nodes[0], nodes[1]), fill=fade(VIOLET, 0.5 + intensity * 0.45), width=1)
    draw.line((nodes[0], nodes[2]), fill=fade(VIOLET, 0.5 + intensity * 0.45), width=1)
    draw.line((nodes[1], nodes[2]), fill=fade(VIOLET, 0.5 + intensity * 0.45), width=1)
    for nx, ny in nodes:
        draw.ellipse((nx - 3, ny - 3, nx + 3, ny + 3), fill=fade(VIOLET, 0.72 + intensity * 0.28))
    centered_text(draw, (x, y + 54), "SUB-AGENT", MONO_10, fade(TEXT, 0.68 + intensity * 0.3))
    centered_text(draw, (x, y + 70), "AUTHORIZED CONNECTION", MONO_8, fade(MUTED, 0.5 + intensity * 0.3))


def draw_litellm(frame: Image.Image, draw: ImageDraw.ImageDraw, intensity: float) -> None:
    left, top, right, bottom = 940, 286, 1048, 414
    outline = fade(CYAN, 0.25 + intensity * 0.66)
    fill = mix(SURFACE, CYAN, 0.018 + intensity * 0.04)
    draw.rounded_rectangle((left, top, right, bottom), radius=22, fill=fill, outline=outline, width=1)
    icon = brand_icon("litellm", 56, 0.6 + 0.4 * intensity)
    frame.paste(icon, (966, 304), icon)
    centered_text(draw, (994, 383), "LiteLLM", TEXT_14, fade(TEXT, 0.68 + intensity * 0.3))
    centered_text(draw, (994, 399), "ROUTE · KEY · COST", MONO_8, fade(MUTED, 0.48 + intensity * 0.3))


def draw_guardrails(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float, intensity: float, decision: str) -> None:
    left, top, right, bottom = 950, 493, 1142, 579
    outline = fade(AMBER if decision != "ALLOW" else CYAN, 0.22 + intensity * 0.64)
    fill = mix(SURFACE, AMBER, 0.018 + intensity * 0.035)
    dashed_line(draw, ((left + 18, top), (right - 18, top)), outline, width=1, dash=5, gap=5)
    draw.line((left, top + 18, left, bottom - 18), fill=outline, width=1)
    draw.line((right, top + 18, right, bottom - 18), fill=outline, width=1)
    draw.arc((left, top, left + 36, top + 36), 180, 270, fill=outline, width=1)
    draw.arc((right - 36, top, right, top + 36), 270, 360, fill=outline, width=1)
    draw.arc((left, bottom - 36, left + 36, bottom), 90, 180, fill=outline, width=1)
    draw.arc((right - 36, bottom - 36, right, bottom), 0, 90, fill=outline, width=1)
    scan_color = fade(AMBER, 0.75 * intensity)
    if intensity > 0:
        scan_x = left + 18 + (right - left - 36) * ((t * 1.7) % 1.0)
        draw.line((scan_x, top + 10, scan_x, bottom - 10), fill=scan_color, width=2)
    icon = brand_icon("nvidia", 32, 0.58 + 0.42 * intensity)
    frame.paste(icon, (962, 514), icon)
    draw.text((999, 514), "NeMo Guardrails", font=TEXT_12, fill=fade(TEXT, 0.62 + intensity * 0.34))
    draw.text((999, 534), "INPUT · OUTPUT · POLICY", font=MONO_8, fill=fade(MUTED, 0.48 + intensity * 0.32))
    status_color = CYAN if decision == "ALLOW" else AMBER
    draw.ellipse((999, 550, 1005, 556), fill=fade(status_color, 0.7 + intensity * 0.3))
    draw.text((1012, 553), decision, font=MONO_8, fill=fade(status_color, 0.72 + intensity * 0.25), anchor="lm")


def draw_endpoint(frame: Image.Image, draw: ImageDraw.ImageDraw, intensity: float) -> None:
    x, y = 1192, 350
    outline = fade(CYAN, 0.2 + intensity * 0.68)
    draw.ellipse((x - 57, y - 57, x + 57, y + 57), fill=SURFACE, outline=fade(RULE, 0.85), width=1)
    draw.ellipse((x - 41, y - 41, x + 41, y + 41), fill=fade(SURFACE_HIGH, 0.95), outline=outline, width=1)
    icon = brand_icon("anthropic", 44, 0.58 + 0.42 * intensity)
    frame.paste(icon, (x - 22, y - 22), icon)
    centered_text(draw, (x, y + 74), "ANTHROPIC", MONO_10, fade(TEXT, 0.72 + intensity * 0.28))
    centered_text(draw, (x, y + 90), "CLAUDE ENDPOINT", MONO_8, fade(MUTED, 0.52 + intensity * 0.28))


def phase_label(t: float) -> str:
    if t < 0.8:
        return "01 / AGENT READY"
    if t < 2.45:
        return "02 / CAPABILITIES BOUND"
    if t < 3.55:
        return "03 / AUTHORIZED DELEGATION"
    if t < 4.65:
        return "04 / MODEL REQUEST ROUTED"
    if t < 5.9:
        return "05 / SECURITY INSPECTION"
    if t < 6.75:
        return "06 / ENDPOINT AUTHORIZED"
    if t < 7.65:
        return "07 / RESPONSE OBSERVED"
    return "08 / READY"


def render_frame(t: float) -> Image.Image:
    frame = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(frame)
    draw_grid(draw)

    draw.rounded_rectangle((520, 66, 1254, 655), radius=15, fill=fade(SURFACE, 0.24), outline=fade(RULE, 0.58), width=1)
    draw.text((542, 94), "PROJECT REQUEST BOUNDARY", font=MONO_9, fill=fade(MUTED, 0.52))
    draw.text((1228, 94), "AUTHENTICATED", font=MONO_8, fill=fade(CYAN, 0.68), anchor="ra")
    draw.ellipse((1237, 91, 1243, 97), fill=CYAN)
    draw.text((1228, 117), phase_label(t), font=MONO_8, fill=fade(TEXT, 0.38), anchor="ra")

    runtime_box = (560, 120, 920, 584)
    draw.rounded_rectangle(runtime_box, radius=28, fill=fade(SURFACE, 0.28), outline=fade(VIOLET, 0.34), width=1)
    draw.text((582, 145), "NEMOCLAW CONFIGURED", font=MONO_10, fill=fade(VIOLET, 0.8))
    draw.text((582, 163), "DESIRED STATE · RUNTIME LIFECYCLE", font=MONO_8, fill=fade(MUTED, 0.52))
    draw.text((560, 603), "OPENSHELL POLICY · PROCESS · FILESYSTEM · EGRESS", font=MONO_8, fill=fade(AMBER, 0.54))

    agent_pulse = 0.5 + 0.5 * math.sin(t * math.pi)
    response_active = active_window(t, 6.75, 7.65)

    extensions = [
        (("claude-code",), (650, 204), "SKILL", "CLAUDE CODE", 0.78),
        (("github", "jira", "confluence"), (785, 190), "MCP", "GITHUB · ROVO", 1.16),
        (("postgresql",), (645, 493), "KNOWLEDGE BASE", "PGVECTOR", 1.54),
        (("mem0",), (812, 500), "MEMORY", "MEM0", 1.92),
    ]
    agent_center = (790.0, 350.0)
    extension_paths: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for _logos, center, _label, _detail, start in extensions:
        vector_x = agent_center[0] - center[0]
        vector_y = agent_center[1] - center[1]
        length = math.hypot(vector_x, vector_y)
        endpoint = (
            agent_center[0] - vector_x / length * 95,
            agent_center[1] - vector_y / length * 95,
        )
        extension_paths.append((center, endpoint))
        intensity = active_window(t, start, start + 0.72)
        draw.line((center, endpoint), fill=fade(VIOLET, 0.16 + intensity * 0.58), width=1)

    branch_path = ((860, 276), (895, 224), (891, 195))
    branch_intensity = active_window(t, 2.45, 3.55)
    dashed_line(draw, branch_path, fade(VIOLET, 0.2 + branch_intensity * 0.64), width=1, dash=7, gap=7)

    main_path = ((892, 350), (940, 350), (1048, 350), (1095, 350), (1135, 350))
    draw.line((582, 350, 684, 350), fill=fade(CYAN, 0.28), width=1)
    draw_arrowhead(draw, (684, 350), fade(CYAN, 0.5))
    draw.text((633, 329), "TASK ENTRY", font=MONO_10, fill=fade(CYAN, 0.72), anchor="mm")
    draw.line(main_path, fill=fade(CYAN, 0.2), width=1)
    draw_arrowhead(draw, (934, 350), fade(CYAN, 0.28))
    draw.text((918, 329), "CONFIG", font=MONO_9, fill=fade(VIOLET, 0.62), anchor="mm")
    draw.rounded_rectangle((912, 337, 928, 363), radius=5, fill=SURFACE_HIGH, outline=fade(VIOLET, 0.54), width=1)
    draw.line((916, 350, 924, 350), fill=fade(CYAN, 0.58), width=1)

    guardrail_intensity = active_window(t, 4.55, 6.05) + active_window(t, 6.72, 7.15) * 0.65
    decision = "ALLOW" if t >= 5.72 else "INSPECT"
    gate_color = CYAN if decision == "ALLOW" else AMBER
    draw.line((1095, 380, 1095, 493), fill=fade(gate_color, 0.16 + min(1.0, guardrail_intensity) * 0.65), width=1)
    draw.polygon(((1095, 335), (1106, 341), (1103, 359), (1095, 366), (1087, 359), (1084, 341)), outline=fade(gate_color, 0.35 + min(1.0, guardrail_intensity) * 0.58))
    draw.text((1095, 306), "GUARDRAIL GATE", font=MONO_8, fill=fade(MUTED, 0.62), anchor="mm")
    draw.text((1095, 323), decision, font=MONO_10, fill=fade(gate_color, 0.68 + min(1.0, guardrail_intensity) * 0.3), anchor="mm")
    dashed_line(draw, ((1105, 337), (1123, 286), (1138, 286)), fade(RED, 0.22 + active_window(t, 4.8, 5.55) * 0.45), width=1, dash=5, gap=5)
    draw.ellipse((1135, 283, 1141, 289), fill=fade(RED, 0.25 + active_window(t, 4.8, 5.55) * 0.58))
    draw.text((1143, 286), "DENY", font=MONO_8, fill=fade(RED, 0.32 + active_window(t, 4.8, 5.55) * 0.48), anchor="lm")

    for logos, center, label, detail, start in extensions:
        draw_extension_node(frame, draw, center, label, detail, logos, active_window(t, start, start + 0.72))

    draw_openclaw(frame, draw, agent_pulse, response_active)
    draw_sub_agent(draw, branch_intensity)
    litellm_intensity = active_window(t, 3.55, 6.75) + active_window(t, 6.75, 7.55) * 0.45
    draw_litellm(frame, draw, min(1.0, litellm_intensity))
    draw_guardrails(frame, draw, t, min(1.0, guardrail_intensity), decision)
    endpoint_intensity = active_window(t, 5.9, 7.35)
    draw_endpoint(frame, draw, endpoint_intensity)

    for path, extension in zip(extension_paths, extensions):
        start = extension[4]
        intensity = active_window(t, start, start + 0.72)
        if intensity > 0:
            progress = ease((t - start) / 0.58)
            glow_dot(draw, point_on_polyline(path, progress), VIOLET, radius=3, strength=intensity)

    if branch_intensity > 0:
        local = (t - 2.45) / 1.1
        progress = ease(local * 2) if local < 0.5 else ease((1.0 - local) * 2)
        glow_dot(draw, point_on_polyline(branch_path, progress), VIOLET, radius=3, strength=branch_intensity)

    request_active = active_window(t, 3.55, 4.72)
    if request_active > 0:
        progress = ease((t - 3.55) / 1.05)
        request_point = point_on_polyline(main_path[:-1], progress)
        glow_dot(draw, request_point, CYAN, radius=4, strength=request_active)
        draw.text((request_point[0], request_point[1] - 16), "REQUEST", font=MONO_8, fill=fade(CYAN, 0.66), anchor="mm")
    elif 4.55 <= t < 5.92:
        glow_dot(draw, (1077, 350), AMBER, radius=4, strength=0.78)

    endpoint_active = active_window(t, 5.84, 6.76)
    if endpoint_active > 0:
        progress = ease((t - 5.84) / 0.8)
        endpoint_path = ((1095, 350), (1135, 350), (1149, 350))
        glow_dot(draw, point_on_polyline(endpoint_path, progress), CYAN, radius=4, strength=endpoint_active)

    if response_active > 0:
        response_path = ((1149, 366), (1095, 366), (1048, 366), (940, 366), (892, 366))
        progress = ease((t - 6.75) / 0.82)
        response_point = point_on_polyline(response_path, progress)
        draw.line(response_path, fill=fade(CYAN, 0.28 + response_active * 0.24), width=1)
        draw_arrowhead(draw, (907, 366), fade(CYAN, 0.56), direction=-1)
        glow_dot(draw, response_point, CYAN, radius=3, strength=response_active)
        draw.text((response_point[0], response_point[1] + 16), "RESPONSE", font=MONO_8, fill=fade(CYAN, 0.62), anchor="mm")

    audit_active = active_window(t, 4.55, 7.8)
    draw.line((930, 613, 1230, 613), fill=fade(RULE, 0.62), width=1)
    draw.text((930, 603), "AUDIT RECORD", font=MONO_8, fill=fade(MUTED, 0.46))
    audit_value = "REQUEST ID · POLICY · DECISION · MODEL · COST"
    if t >= 5.72:
        audit_value = "TL-7F42 · GUARDRAIL ALLOW · MODEL ROUTED · COST ATTRIBUTED"
    draw.text((1230, 630), audit_value, font=MONO_8, fill=fade(CYAN if t >= 5.72 else MUTED, 0.28 + audit_active * 0.48), anchor="ra")
    draw.text((542, 685), "OPENCLAW IS THE ENTRY · EXTENSIONS ENHANCE · POLICY DECIDES", font=MONO_8, fill=fade(MUTED, 0.34))
    draw.text((1238, 685), "GOVERNED REQUEST / 08S", font=MONO_8, fill=fade(MUTED, 0.34), anchor="ra")

    return frame


def quantize_frames(frames: Iterable[Image.Image]) -> list[Image.Image]:
    frames = list(frames)
    palette_source = Image.new("RGB", (WIDTH * 3, HEIGHT), BG)
    palette_source.paste(frames[0], (0, 0))
    palette_source.paste(frames[len(frames) // 2], (WIDTH, 0))
    palette_source.paste(frames[-12], (WIDTH * 2, 0))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette_image = Image.new("P", (1, 1))
    palette_image.putpalette(palette.getpalette())
    return [
        frame.quantize(palette=palette_image, dither=Image.Dither.NONE)
        for frame in frames
    ]


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    frames = [render_frame(index / FPS) for index in range(FPS * DURATION_SECONDS)]
    poster = render_frame(6.18)
    poster.save(POSTER_PATH, optimize=True)

    gif_frames = quantize_frames(frames)
    gif_frames[0].save(
        GIF_PATH,
        save_all=True,
        append_images=gif_frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Generated {GIF_PATH} ({GIF_PATH.stat().st_size:,} bytes)")
    print(f"Generated {POSTER_PATH} ({POSTER_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
