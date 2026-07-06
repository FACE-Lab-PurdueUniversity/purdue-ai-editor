NeoPixel / WS2812 addressable RGB LED strip on ESP32 MicroPython.

```python
from machine import Pin
from neopixel import NeoPixel

NUM_LEDS = 8
pixels = NeoPixel(Pin(<DIN_PIN>, Pin.OUT), NUM_LEDS)

# Set individual pixels: (R, G, B) each 0–255
pixels[0] = (255, 0, 0)    # red
pixels[1] = (0, 255, 0)    # green
pixels[2] = (0, 0, 255)    # blue
pixels[3] = (255, 165, 0)  # orange
pixels.write()              # send data to strip

# Turn all off
for i in range(NUM_LEDS):
    pixels[i] = (0, 0, 0)
pixels.write()
```

Connect DIN to any safe ESP32 GPIO output pin. VCC needs 5V (use 5V pin on board).
