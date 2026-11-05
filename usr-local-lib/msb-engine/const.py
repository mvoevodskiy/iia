import re

HELPER_VERSION = "1.0.0"

ACTIONS = (
    "status",
    "enable-jarvis",
    "disable-jarvis",
    "enable-openclaw",
    "disable-openclaw",
    "update-openclaw",
)

SOURCE_ACTIONS = {
    "client": ACTIONS,
    "openclaw": ("status", "enable-jarvis", "update-openclaw"),
}

REQUEST_KEYS = {
    "status": ("bot_id",),
    "enable-jarvis": ("bot_id",),
    "disable-jarvis": ("bot_id",),
    "enable-openclaw": ("bot_id",),
    "disable-openclaw": ("bot_id",),
    "update-openclaw": ("bot_id",),
}

REQUIRED_KEYS = {
    "disable-jarvis": ("bot_id",),
}

CODES = (
    "OK", "RUNNING",
    "RATE_LIMITED", "REPLAY", "HOST_NOT_READY", "BUSY",
    "BAD_REQUEST", "ALREADY_ENABLED", "ALREADY_DISABLED",
    "ENGINE_OFF", "NOT_INSTALLED", "NOT_AVAILABLE", "NOT_ALLOWED",
    "ALREADY_CURRENT", "DOWNGRADE", "FAILED",
)

SOURCES = (
    ("client", "/home/client/.msb/engine", "client"),
    ("openclaw", "/home/openclaw/.msb-engine", "openclaw"),
)

REQUEST_NAME = "request"
SLEEP_PREFIX = "sleep."
RESULTS_KEEP = 32
REQUEST_MAX = 4096
REQUEST_LIMIT = 20
RATE_WINDOW = 3600
SEEN_KEEP = 64
STUCK_SLEEP = 10

CLIENT_HOME = "/home/client"
OC_HOME = "/home/openclaw"
RUN_DIR = "/run/msb-engine"
COMPAT_RUN = "/run/jarvis-engine"
STATE_DIR = "/var/lib/msb-engine"
ETC_DIR = "/etc/msb-engine"
LIB_DIR = "/usr/local/lib/msb-engine"
HELPER = "/usr/local/sbin/msb-engine"
BOT_UNIT_TMPL = "msb-bot@%s.service"
BOT_TEMPLATE = "/etc/systemd/system/msb-bot@.service"
MARKS_DIR = "/etc/msb-engine/bots"
OC_OFF = "/var/lib/msb-engine/openclaw.off"
OC_MARKER = "/var/lib/msb-engine/openclaw.installed"
OC_UNITS = (
    "openclaw-gateway.service",
    "openclaw.service",
    "msb-openclaw.service",
)

ID_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")
BOT_ID_RE = re.compile(r"[a-zA-Z0-9_-]{1,32}")
