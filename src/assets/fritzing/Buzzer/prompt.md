The Lily∞Bot uses basic piezo buzzer controlled by PWM. Here is code to create a musical scale:
```python
# MicroPython code to play a C major scale (C4, D4, E4, F4, G4, A4, B4) on a buzzer
# Hardware: Pico W, Buzzer connected to GP22 (buzzer +). GND to buzzer -.
# Notes:
# - Frequencies are in Hz (Hz = cycles per second), Duration is in milliseconds per note, Duty cycle is set to about 50% for a clear tone
from machine import Pin, PWM
from time import sleep_ms
# Configuration
BUZZER_PIN = 22      # GP22 corresponds to GPIO 22 (buzzer +)
NOTE_DURATION = 400   # duration of each note in ms (you can change this)
# Helper function: play a single note on the buzzer
buzzer = PWM(Pin(<BUZZER_PIN>))
buzzer.freq(100)          # initial frequency; will be changed for each note
buzzer.duty_u16(0)      # start with no sound
def play_note(freq, duration_ms):
    if freq <= 0:
        # Rest (silence)
        buzzer.duty_u16(0)
    else:
        buzzer.freq(int(freq))
        buzzer.duty_u16(32768)  # ~50% duty cycle
    sleep_ms(int(duration_ms))  #  hold the note for the specified duration 
    buzzer.duty_u16(0) # short silence between notes
    sleep_ms(20)
# Notes for Middle C scale (C4 to B4)
# Frequencies (Hz)
C4 = 261.63
D4 = 293.66
E4 = 329.63
F4 = 349.23
G4 = 392.00
A4 = 440.00
B4 = 493.88
scale = [C4, D4, E4, F4, G4, A4, B4] # Scale sequence: C D E F G A B
print("Playing C major scale from C4 to B4...")
for freq in scale: # for loop that runs through all the notes
    play_note(freq, NOTE_DURATION)
# Stop the buzzer cleanly
buzzer.deinit() #Close PWM
print("Done.")
```
