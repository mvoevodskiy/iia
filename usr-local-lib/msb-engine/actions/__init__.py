from .bots import act_disable_jarvis, act_enable_jarvis
from .openclaw import act_disable_openclaw, act_enable_openclaw, act_update_openclaw
from .status import act_status

ACTS = {
    "status": act_status,
    "enable-jarvis": act_enable_jarvis,
    "disable-jarvis": act_disable_jarvis,
    "enable-openclaw": act_enable_openclaw,
    "disable-openclaw": act_disable_openclaw,
    "update-openclaw": act_update_openclaw,
}
