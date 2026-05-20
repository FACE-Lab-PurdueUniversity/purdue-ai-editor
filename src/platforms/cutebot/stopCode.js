// Stop both Cutebot motors by writing the I²C command bytes directly. Mirrors
// CUTEBOT.set_motors_speed(0, 0) so it works even when student code never
// imported the cutebot module. Defensive try/except keeps stop a no-op if the
// I²C bus is in a bad state.
export const stopCode = `
try:
    from microbit import i2c
    i2c.write(0x10, bytes([0x01, 0x02, 0, 0]))
    i2c.write(0x10, bytes([0x02, 0x02, 0, 0]))
except Exception:
    pass
`;
