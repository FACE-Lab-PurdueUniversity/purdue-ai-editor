The Lily∞Bot uses basic LEDs. Here is code for turning on/off LEDs in a simple sequence:
```python
# Lily∞Bot: Cycle red, blue, and green LEDs in sequence
from machine import Pin
from time import sleep
# Define LED pins as outputs where <LED_PIN_1>, <LED_PIN_2>, and <LED_PIN_3> represent the GPIOs for the three LEDs
red_led   = Pin(<LED_PIN_1>, Pin.OUT)
blue_led  = Pin(<LED_PIN_2>, Pin.OUT)
green_led = Pin(<LED_PIN_3, Pin.OUT)
def all_off():   # Helper function to turn all LEDs off
    red_led.value(0)
    blue_led.value(0)
    green_led.value(0)
all_off() # Initialization
print("LED cycle: red -> blue -> green")
while True:  # Forever loop to cycle through LEDs
    # Red on, others off
    all_off()
    red_led.value(1)
    sleep(1.0)  # keep red on for 1 second
    # Blue on, others off
    all_off()
    blue_led.value(1)
    sleep(1.0)  # keep blue on for 1 second
    # Green on, others off
    all_off()
    green_led.value(1)
    sleep(1.0)  # keep green on for 1 second
```
