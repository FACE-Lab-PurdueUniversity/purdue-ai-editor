The Lily∞Bot uses a Ultrasonic Distance Sensor - 5V (HC-SR04) for sonar sensing. The VCC and GND are provided by the Raspberry Pi Pico W. Here is code for obstacle avoidance detection using the sonar sensor:
```python
#This code will drive the LilyBot forward
#then turn when obstacle is detected with sonar
from machine import Pin, ADC, PWM
from utime import ticks_us, sleep_us, sleep_ms
#define inputs and outputs
trigger = Pin(<TRIG_PIN>, Pin.OUT)
echo = Pin(<ECHO_PIN>, Pin.IN)
led = Pin(<LED_PIN>, Pin.OUT)
#define motors
AIN1 = Pin(<AIN1_PIN>, Pin.OUT)
AIN2 = Pin(<AIN2_PIN>, Pin.OUT)
PWMA = PWM(Pin(<PWMA_PIN>))
BIN1 = Pin(<BIN1_PIN>, Pin.OUT)
BIN2 = Pin(<BIN2_PIN>, Pin.OUT)
PWMB = PWM(Pin(<PWMB_PIN>))
PWMA.freq(60)
PWMB.freq(60)
motorSpeed = 65535
def reverse(): #define reverse function
    AIN1.value(1)
    AIN2.value(0)
    BIN1.value(1)
    BIN2.value(0)
    PWMA.duty_u16(motorSpeed)
    PWMB.duty_u16(motorSpeed)
def forward(): #define forward function
    AIN1.value(0)
    AIN2.value(1)
    BIN1.value(0)
    BIN2.value(1)
    PWMA.duty_u16(motorSpeed)
    PWMB.duty_u16(motorSpeed)
def pivot(): #define pivot function
    AIN1.value(0)
    AIN2.value(0)
    BIN1.value(0)
    BIN2.value(1)
    PWMA.duty_u16(motorSpeed)
    PWMB.duty_u16(motorSpeed)
def stop(): #define stop function
    AIN1.value(0)
    AIN2.value(0)
    BIN1.value(0)
    BIN2.value(0)
def distance(): # read distance sensor
    timepassed=0
    signalon = 0
    signaloff = 0
    trigger.low()
    sleep_us(2)
    trigger.high()
    sleep_us(5)
    trigger.low()
    while echo.value() == 0:
        signaloff = ticks_us()
    while echo.value() == 1:
        signalon = ticks_us()
    timepassed = signalon - signaloff
    dist_cm = (timepassed*0.0343)/2
    if dist_cm>60:
        dist_cm=60
    return dist_cm
#print starting message to serial monitor
print("Obstacle Avoidance on LilyBot...")
print ("Turn on Standby Pin...")
STBY.value(1)
while True: #run indefinitely
    reading = distance()
    print("Distance:", reading)
    if reading<10:
        led.value(1)
        stop()
        sleep_ms(100)
        reverse()
        sleep_ms(500)
        pivot()
        sleep_ms(500)
    else:
        led.value(0)
        forward()
        sleep_ms(100)
```
