# Start your new code here!
# LilyBot Wiring Calibration
# ---------------------------------------------------------------
# Run this ONCE after you build your LilyBot.
#
# It spins each motor by itself so you can see which way the
# wheel turns. If a wheel turns the WRONG way, swap that motor's
# red and black wires at the TB6612 terminal block, then run
# this script again.
#
# Convention used:  positive speed = the wheel should rotate so
#                   that the bot would move FORWARD.
# ---------------------------------------------------------------

from machine import Pin, PWM
from time import sleep

# ---- Hardware setup ----
LEFT_IN1 = Pin(16, Pin.OUT)
LEFT_IN2 = Pin(17, Pin.OUT)
LEFT_PWM = PWM(Pin(18))

RIGHT_IN1 = Pin(21, Pin.OUT)
RIGHT_IN2 = Pin(20, Pin.OUT)
RIGHT_PWM = PWM(Pin(19))

STANDBY = Pin(14, Pin.OUT)
STANDBY.value(1)

LEFT_PWM.freq(60)
RIGHT_PWM.freq(60)


# ---- Motor control ----
def set_left(speed):
    if speed > 0:
        LEFT_IN1.value(0)
        LEFT_IN2.value(1)
    elif speed < 0:
        LEFT_IN1.value(1)
        LEFT_IN2.value(0)
    else:
        LEFT_IN1.value(0)
        LEFT_IN2.value(0)
    LEFT_PWM.duty_u16(abs(speed) * 655)

def set_right(speed):
    if speed > 0:
        RIGHT_IN1.value(0)
        RIGHT_IN2.value(1)
    elif speed < 0:
        RIGHT_IN1.value(1)
        RIGHT_IN2.value(0)
    else:
        RIGHT_IN1.value(0)
        RIGHT_IN2.value(0)
    RIGHT_PWM.duty_u16(abs(speed) * 655)

def drive(left_speed, right_speed):
    set_left(left_speed)
    set_right(right_speed)

def stop():
    drive(0, 0)


# ---- Calibration routine ----
TEST_SPEED = 60   # gentle test speed (out of 100)

print()
print("=" * 52)
print(" LilyBot Wiring Calibration")
print("=" * 52)
print()
print("Lift the LilyBot so the wheels can spin freely (or")
print("prop it up on a small stand or block).")
print()
print("We'll spin each wheel by itself. For each one, ask:")
print()
print("   'If the bot were on the floor right now, would THIS")
print("    wheel push the bot FORWARD?'")
print()
print("Starting in 5 seconds...")
for x in range (5):
  print (5-x)
  sleep (1)



# --- Test 1: LEFT motor only ---
print()
print("--- Test 1 of 2: LEFT motor ---")
print(">>> Spinning LEFT wheel for 3 seconds...")
drive(TEST_SPEED, 0)
sleep(3)
stop()
print(">>> Stopped.")
print()
print("Did the LEFT wheel rotate FORWARD?")
print("  (the top of the wheel should move toward the FRONT")
print("   of the bot)")
print()
print("   YES  ->  Left motor wiring is correct.")
print("   NO   ->  Power off, then SWAP the red and black")
print("            wires for the LEFT motor at the TB6612")
print("            terminal block. Then re-run this script.")
print()
sleep(3)


# --- Test 2: RIGHT motor only ---
print("--- Test 2 of 2: RIGHT motor ---")
print(">>> Spinning RIGHT wheel for 3 seconds...")
drive(0, TEST_SPEED)
sleep(3)
stop()
print(">>> Stopped.")
print()
print("Did the RIGHT wheel rotate FORWARD?")
print()
print("   YES  ->  Right motor wiring is correct.")
print("   NO   ->  Power off, then SWAP the red and black")
print("            wires for the RIGHT motor at the TB6612")
print("            terminal block. Then re-run this script.")
print()
sleep(3)


# --- Final sanity check: both motors together ---
print("--- Final check: both motors forward ---")
print()
print("If both wheels passed, this should drive the bot")
print("STRAIGHT FORWARD. Put the bot on the floor if you")
print("want to see it actually roll.")
print()
print(">>> Driving forward in 3 seconds...")
sleep(3)
drive(TEST_SPEED, TEST_SPEED)
sleep(2)
stop()
print()
print("Calibration complete!")
print()
print("If anything looked wrong, fix the wires on the bad")
print("motor and run this script again to confirm.")
print()