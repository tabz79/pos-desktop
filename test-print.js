import { Printer } from '@node-escpos/core';
import USB from '@node-escpos/usb-adapter';

// Create USB device
const device = new USB();

// Printer options
const options = { encoding: "GB18030" }; // common for ESC/POS printers

const printer = new Printer(device, options);

device.open(() => {
  printer
    .align('ct')
    .style('b')
    .size(2, 2)
    .text('Hello Zadig!')
    .size(1, 1)
    .text('---')
    .text('Printer test successful')
    .cut()
    .close();
});
