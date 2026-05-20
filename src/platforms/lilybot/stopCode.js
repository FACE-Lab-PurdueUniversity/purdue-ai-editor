export const stopCode = `
from machine import Pin, PWM

for _gp in range(29):
    try:
        _pwm = PWM(Pin(_gp))
        _pwm.duty_u16(0)
        _pwm.deinit()
    except Exception:
        pass
    try:
        Pin(_gp, Pin.OUT).value(0)
    except Exception:
        pass
`;
