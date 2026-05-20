# Why we use "percent" instead of the motor's raw number
# ---------------------------------------------------------------
# This script explains why we like percentages (0..100) for motor speed
# instead of raw values (0..65535). It also RUNS the motors so you can
# see and hear the difference at several percentage speeds.
# Lines that start with # are comments. Ask if any comment is unclear.
# ---------------------------------------------------------------

############ Set-up ############
from machine import Pin, PWM
from time import sleep_ms

# TB6612 motor driver (pin mapping from your Lily∞Bot)
STBY = Pin(14, Pin.OUT)

LEFT_AIN1 = Pin(16, Pin.OUT)
LEFT_AIN2 = Pin(17, Pin.OUT)
LEFT_PWM  = PWM(Pin(18))

RIGHT_BIN1 = Pin(21, Pin.OUT)
RIGHT_BIN2 = Pin(20, Pin.OUT)
RIGHT_PWM  = PWM(Pin(19))

# Enable the motor driver and set PWM frequency
STBY.value(1)
LEFT_PWM.freq(60)
RIGHT_PWM.freq(60)

############ Helpers ############
def percent_to_u16(percent):
    """Convert 0..100 to 0..65535 (what duty_u16 expects)."""
    return percent * 655

def stop_motors():
    LEFT_AIN1.value(0)
    LEFT_AIN2.value(0)
    RIGHT_BIN1.value(0)
    RIGHT_BIN2.value(0)
    LEFT_PWM.duty_u16(0)
    RIGHT_PWM.duty_u16(0)

def forward_percent(percent):
    # Set both motors forward and apply the same percent speed
    LEFT_AIN1.value(0)
    LEFT_AIN2.value(1)
    RIGHT_BIN1.value(0)
    RIGHT_BIN2.value(1)
    Motor_Speed = percent_to_u16(percent)
    LEFT_PWM.duty_u16(Motor_Speed)
    RIGHT_PWM.duty_u16(Motor_Speed)

############ Short explanation (printed) ############
print()
print("Motor speeds can be set from 0..65535 (very precise). These are called u16 numbers or numbers between 0 and 2 raised to the 16th power!")
print("But, large numbers like 39300 don't make sense as a motor speed.")
print("Percent is easier to think about: 0% (stop), 50% (half speed), 100% (full speed).")
print("We convert percent to a speed number used by the motor by multiplying by 655.")
print()

print("   percent   ->   motor speed (u16)")
print("   -------        --------")
for percent in [0, 25, 50, 60, 75, 100]:
    Motor_Speed = percent_to_u16(percent)
    note = ""
    if percent == 60:
        note = "  (nice with weak batteries)"
    if percent == 100:
        note = "  (full speed)"
    print("     {:>3}%     ->    {:>5}{}".format(percent, Motor_Speed, note))
print()

############ Motor demonstration ############
print("Now driving forward at the same percent values...")
stop_motors()
sleep_ms(600)

for percent in [0, 25, 50, 60, 75, 100]:
    Motor_Speed = percent_to_u16(percent)
    print("Forward at {}% (motor speed = {})".format(percent, Motor_Speed))
    if percent == 0:
        stop_motors()
        sleep_ms(800)
    else:
        forward_percent(percent)
        sleep_ms(1500)
        stop_motors()
        sleep_ms(600)

print("Done. Motors stopped.")
stop_motors()
