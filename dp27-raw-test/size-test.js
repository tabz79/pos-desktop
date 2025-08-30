const printer = require("@thiagoelg/node-printer");

// Use the exact printer name from your getPrinters() output
const printerName = "DP27P Label Printer (USB)";

// Different SIZE trials
const sizes = [
  { w: 50, h: 25 }, // original
  { w: 45, h: 23 }, // slightly smaller
  { w: 40, h: 20 }, // smaller
  { w: 35, h: 18 }, // much smaller
];

// Function to send one TSPL test
function sendTSPL(size, index) {
  const tsplCommand = `
SIZE ${size.w} mm,${size.h} mm
GAP 2 mm,0
DIRECTION 1
CLS
TEXT 20,20,"3",0,1,1,"Test ${index + 1}: ${size.w}x${size.h}mm"
PRINT 1
`;

  printer.printDirect({
    data: Buffer.from(tsplCommand, "utf-8"),
    printer: printerName,
    type: "RAW",
    success: jobID => console.log(`✅ Sent test ${index + 1}: ${size.w}x${size.h}mm (Job ID: ${jobID})`),
    error: err => console.error(`❌ Error on test ${index + 1}:`, err)
  });
}

// Run all tests with 3-second gaps between
sizes.forEach((size, i) => {
  setTimeout(() => sendTSPL(size, i), i * 3000);
});
