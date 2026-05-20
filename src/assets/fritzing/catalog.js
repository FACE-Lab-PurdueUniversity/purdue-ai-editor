/**
 * Static catalog of all available Fritzing parts.
 *
 * To add a new part:
 *   1. Drop its .fzp and .svg files into src/assets/fritzing/<folder>/
 *   2. Add an entry here.
 *   3. Add its id to the LILYBOT_MPUS or LILYBOT_COMPONENTS list in supabase app_config.
 *
 * Supabase app_config entries are simple id arrays, e.g.:
 *   LILYBOT_MPUS:       ["rpi-picow"]
 *   LILYBOT_COMPONENTS: ["adafruit-tb6612", "hc-sr04"]
 */

const fritzingCatalog = [
  {
    id: 'rpi-picow',
    name: 'Raspberry Pi Pico W',
    kind: 'mpu',
    folder: 'PicoW',
  },
  {
    id: 'adafruit-tb6612',
    name: 'Adafruit TB6612 Motor Driver',
    kind: 'component',
    folder: 'AdafruitTB6612',
  },
  {
    id: 'hc-sr04',
    name: 'HC-SR04 Ultrasonic Distance Sensor',
    kind: 'component',
    folder: 'HC-SR04',
  },
  {
    id: 'arduino-uno-r3',
    name: 'Arduino Uno R3',
    kind: 'mpu',
    folder: 'ArduinoUnoR3',
  },
  {
    id: "led-5mm",
    name: "LED 5mm",
    kind: "component",
    folder: 'LED5mm',
  },
  {
    id: "us100ultrasonic",
    name: "US-100 Ultrasonic Sensor",
    kind: "component",
    folder: 'US100Ultrasonic',
  },
  {
    id: "buzzer",
    name: "Buzzer",
    kind: "component",
    folder: 'Buzzer',
  },
  {
    id: "lcd1602iic",
    name: "LCD 1602 IIC Display Module",
    kind: "component",
    folder: 'LCD1602IIC',
  },
  {
    id: "mpu6050gy521",
    name: "MPU-6050 GY-521 Gyroscope",
    kind: "component",
    folder: 'MPU6050GY521',
  },
  {
    id: "tb6612fng",
    name: "TB6612FNG Motor Driver",
    kind: "component",
    folder: 'TB6612FNG',
  },
  {
    id: "sg90",
    name: "SG90 Servo",
    kind: "component",
    folder: 'SG90',
  },
  {
    id: "dht11",
    name: "DHT11 Temp & Humidity",
    kind: "component",
    folder: 'DHT11TempHumidity',
  },
  {
    id: "lm393",
    name: "LM393 IR Sensor",
    kind: "component",
    folder: 'LM393',
  },
  {
    id: "ky037",
    name: "KY-037 Microphone Sound Sensor",
    kind: "component",
    folder: 'KY037',
  },
  {
    id: "photoresistor",
    name: "Photoresistor",
    kind: "component",
    folder: 'Photoresistor',
  }
];

export default fritzingCatalog;
