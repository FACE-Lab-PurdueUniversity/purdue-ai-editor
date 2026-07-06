ESP32-WROOM-32E / ESP32-S pin reference for MicroPython.

Safe output GPIOs: 0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
Input-only (no output): 34, 35, 36, 39
Never use: 6, 7, 8, 9, 10, 11 (internal flash — hardware damage risk)

PWM duty cycle range: 0–1023 (NOT 0–65535 like Pico)
ADC: 12-bit (0–4095), call .atten(ADC.ATTN_11DB) for full 0–3.3V range
Default I2C: SDA=GPIO21, SCL=GPIO22
DAC (analog output): GPIO25 and GPIO26 only, 8-bit (0–255)
