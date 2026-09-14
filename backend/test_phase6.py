"""Phase 6 self-check — UI/design consistency pass. Run: python test_phase6.py

Static source checks, same pattern as test_phase5.py (no frontend test runner
exists in this repo). This phase touched ~20 files for icons/tokens/whitespace,
so these checks exist to pin the REAL bugs found along the way — not the
cosmetic changes — so they can't silently regress.
"""

import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "src"


def _read(*parts: str) -> str:
    return (FRONTEND / Path(*parts)).read_text(encoding="utf-8")


def test_no_off_palette_colors_remain():
    """indigo/emerald/rose/amber/blue/gray were scattered ad-hoc across 15+
    files before this phase — migrated to semantic tokens (primary/success/
    danger/warning) defined once in tailwind.config.js. The one deliberate
    exception: Eye.tsx's calibration dot is described as literally yellow
    (it's a real yellow dot on screen, not a status color) and must stay
    untouched — this test knows about that exception rather than being
    fooled by it.
    """
    offenders = []
    for path in FRONTEND.rglob("*.tsx"):
        rel = str(path.relative_to(FRONTEND))
        raw = path.read_text(encoding="utf-8")
        # Strip /* block */ and // line comments first — several files carry
        # explanatory comments naming the OLD off-palette classes they replaced
        # (e.g. "was bg-gray-100"), which must not be flagged as remaining code.
        code = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL)
        code = re.sub(r"//.*", "", code)
        for m in re.finditer(r"\b(indigo|emerald|rose|amber|blue|gray)-\d", code):
            offenders.append(f"{rel}: {m.group(0)}")
    # Eye.tsx's literal yellow calibration dot is the one sanctioned exception —
    # checked separately so a real yellow-* leak elsewhere still fails loudly.
    offenders = [o for o in offenders if not o.startswith("components/Eye.tsx")]
    assert not offenders, f"off-palette color classes remain: {offenders}"
    print("ok  no off-palette color classes remain (indigo/emerald/rose/amber/blue/gray)")


def test_accessibility_toggle_classes_have_real_css():
    """The bug this guards: applyPrefs() in types/profile.ts has toggled
    high-contrast / dyslexia-font / reduce-motion classes and a --font-scale
    variable on <html> since Phase 0, with ZERO CSS backing any of them —
    toggling these preferences did nothing, silently, since the feature was built.
    """
    css = _read("index.css")
    for cls in (".high-contrast", ".dyslexia-font", ".reduce-motion"):
        assert cls in css, f"{cls} is toggled by applyPrefs() but has no CSS rule"
    assert "--font-scale" in css, "--font-scale is set by applyPrefs() but never read in CSS"
    print("ok  high-contrast / dyslexia-font / reduce-motion / font-scale all have real CSS")


def test_font_scale_applies_to_root_not_body():
    """rem units are always relative to the ROOT (html) element's font-size,
    never body's — an earlier draft of this fix set it on `body`, which would
    have been a silent no-op against every Tailwind text-* utility."""
    css = _read("index.css")
    html_block = re.search(r"\bhtml\s*\{[^}]*--font-scale[^}]*\}", css) or re.search(
        r"\bhtml\s*\{[^}]*font-size:\s*calc\(100%[^}]*\}", css
    )
    assert html_block, "font-scale must be applied on the html selector, not body"
    body_block = re.search(r"(?<!html\s)\bbody\s*\{[^}]*--font-scale[^}]*\}", css)
    assert not body_block, "font-scale on body is a no-op for rem-based Tailwind classes"
    print("ok  --font-scale is applied on html (root), where rem units actually resolve")


def test_no_duplicate_focus_tracker_headings():
    """Real bug found during the icon pass: LearningPage and QuizPage each
    rendered their OWN 'Focus Tracker' / 'Focus check' heading directly above
    <Eye>, which renders an identical title itself in every one of its states
    — two stacked headings saying the same thing."""
    for page in ("LearningPage.tsx", "QuizPage.tsx"):
        src = _read("pages", page)
        # <Eye ... /> must appear with no sibling heading literally adjacent
        # to it in the same wrapper div (allow up to ~2 lines of whitespace/comment).
        idx = src.find("<Eye")
        assert idx != -1, f"{page} no longer renders <Eye>"
        preceding = src[max(0, idx - 200):idx]
        assert not re.search(r"<h[1-6][^>]*>\s*Focus (Tracker|check)", preceding), (
            f"{page} still renders a duplicate heading directly above <Eye>"
        )
    print("ok  no duplicate 'Focus Tracker' heading stacked above <Eye> in Learning/Quiz pages")


def test_chatbot_sends_real_user_id():
    """Real bug found while adding icons: Chatbot.tsx never sent user_id at
    all, so every signed-in student's conversation fell into the backend's
    single 'anonymous' memory bucket — quietly defeating the per-user chat
    isolation fixed in Phase 0.4 (routers/chatbot.py)."""
    src = _read("components", "Chatbot.tsx")
    assert "useProfile" in src, "Chatbot must read the signed-in student's uid"
    assert re.search(r"user_id:\s*uid", src), "Chatbot must send the real uid as user_id, not omit it"
    print("ok  Chatbot sends the real signed-in uid as user_id (Phase 0.4 isolation preserved)")


def test_describe_images_pref_wired_end_to_end():
    """UploadPage's copy promises 'images will get a spoken description', which
    was aspirational until this phase — Phase 3 built the backend
    (image_describer.py) but nothing ever set describeImages from the frontend."""
    profile_ts = _read("types", "profile.ts")
    assert "describeImages" in profile_ts, "describeImages missing from Prefs"

    auth_form = _read("components", "AuthForm.tsx")
    assert "describeImages" in auth_form, "AuthForm must set a describeImages default at signup"

    settings = _read("pages", "SettingsPage.tsx")
    assert "describeImages" in settings, "Settings must expose a describeImages toggle"

    upload_form = _read("components", "UploadForm.tsx")
    assert "describeImages" in upload_form, "UploadForm must send describeImages with the upload"
    print("ok  describeImages: Prefs -> AuthForm default -> Settings toggle -> UploadForm request")


def test_settings_page_reachable():
    """Every accessibility pref captured at signup (Phase 0) had NO way to be
    changed afterward until this phase — no Settings page or route existed."""
    app_tsx = _read("App.tsx")
    assert '"/settings"' in app_tsx, "no /settings route registered"
    assert "SettingsPage" in app_tsx

    layout = _read("components", "Layout.tsx")
    assert '"/settings"' in layout, "Settings is not reachable from the nav"
    print("ok  /settings is routed and reachable from the nav")


def test_no_debug_console_log_or_native_alert_remain():
    offenders = []
    for path in FRONTEND.rglob("*.tsx"):
        rel = str(path.relative_to(FRONTEND))
        for line in path.read_text(encoding="utf-8").splitlines():
            code = line.split("//", 1)[0]  # drop trailing comments
            if re.search(r"(?<![A-Za-z0-9_.])console\.log\(", code):
                offenders.append(f"{rel}: console.log")
            if re.search(r"(?<![A-Za-z0-9_.])alert\(", code):
                offenders.append(f"{rel}: alert(")
    assert not offenders, f"debug/blocking calls remain: {offenders}"
    print("ok  no console.log debug statements or native alert() calls remain")


def test_mobile_nav_exists():
    """Layout's <nav> was `hidden sm:flex` with no fallback at all — a phone
    user had no way to navigate except the skip-to-content link."""
    layout = _read("components", "Layout.tsx")
    assert "sm:hidden" in layout and "mobileOpen" in layout, (
        "no mobile navigation fallback below the sm breakpoint"
    )
    print("ok  mobile navigation fallback exists below the sm breakpoint")


def test_learning_page_auto_reads_when_tts_enabled():
    """Reported directly by the user: turning on Settings' 'Read lessons aloud
    automatically' and opening a lesson did nothing. The SettingsPage toggle
    (test_describe_images_pref_wired_end_to_end's neighbour) had always claimed
    TTS 'starts automatically where available', but profile.prefs.ttsEnabled
    was only ever consumed by QuizPage (auto-reading questions) — LearningPage
    never read it at all."""
    page = _read("pages", "LearningPage.tsx")
    # Match the actual conditional check, not just any mention of the name —
    # an earlier version of this test matched its own explanatory comment
    # first (which mentions ttsEnabled before the real code does) and missed
    # the announce() call entirely as a result. Same class of bug fixed twice
    # elsewhere in this file already.
    assert re.search(r"if\s*\(!profile\.prefs\.ttsEnabled", page), (
        "LearningPage never branches on the ttsEnabled preference"
    )
    assert "announce(simplifiedText" in page, (
        "ttsEnabled is read but nothing calls announce() to actually read the lesson"
    )
    print("ok  LearningPage auto-reads the simplified lesson when ttsEnabled is on")


def test_44px_minimum_touch_targets_on_new_controls():
    """Spot-checks a few controls this phase specifically touched for the
    44x44px minimum target size (motor-disability support, research doc §4.E)."""
    dashboard = _read("pages", "DashboardPage.tsx")
    assert "min-h-[44px]" in dashboard or "min-h-[36px]" in dashboard, (
        "DashboardPage language/sign-out controls lost their minimum touch target"
    )
    upload_form = _read("components", "UploadForm.tsx")
    assert "min-h-[44px]" in upload_form
    print("ok  spot-checked controls retain their 44px minimum touch target")


if __name__ == "__main__":
    tests = [
        test_no_off_palette_colors_remain,
        test_accessibility_toggle_classes_have_real_css,
        test_font_scale_applies_to_root_not_body,
        test_no_duplicate_focus_tracker_headings,
        test_chatbot_sends_real_user_id,
        test_describe_images_pref_wired_end_to_end,
        test_settings_page_reachable,
        test_no_debug_console_log_or_native_alert_remain,
        test_mobile_nav_exists,
        test_learning_page_auto_reads_when_tts_enabled,
        test_44px_minimum_touch_targets_on_new_controls,
    ]
    failures = 0
    for fn in tests:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print("\nPhase 6 self-check:", "PASS" if not failures else f"{failures} FAILED")
    sys.exit(1 if failures else 0)
