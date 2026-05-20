The Lily∞Bot uses a SparkFun TB6612FNG Motor Driver for controlling two DC motors (left motor to motor A, right motor to motor B). The following code will drive the LilyBot using the TB6612 motor driver:
```python
#import libraries from MicroPico MicroPython
from machine import Pin, PWM
from time import sleep_ms 
#define inputs and outputs
STBY = Pin(<STBY>,Pin.OUT)
AIN1 = Pin(<AIN1_PIN>, Pin.OUT)
AIN2 = Pin(<AIN2_PIN>, Pin.OUT)
PWMA = PWM(Pin(<PWMA_PIN>))
BIN1 = Pin(<BIN1_PIN>, Pin.OUT)
BIN2 = Pin(<BIN2_PIN>, Pin.OUT)
PWMB = PWM(Pin(<PWMB_PIN>))
PWMA.freq(60)
PWMB.freq(60)
motorSpeed = 65535 #define motor speed
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
def stop(): #define stop function
    AIN1.value(0)
    AIN2.value(0)
    BIN1.value(0)
    BIN2.value(0)
#print starting message to serial monitor
print("Motor control on Lily∞Bot...")
print ("Turn on Standby Pin...")
STBY.value(1)
while True: #run indefinitely
    forward() #drive robot forward
    sleep_ms(500) #wait 1/2 a second
    stop() #stop robot
    sleep_ms(500) #wait 1/2 a second
    reverse() #drive robot backward
    sleep_ms(500) #wait 1/2 a second
    stop() #stop robot
    sleep_ms(500) #wait 1/2 a second
```
