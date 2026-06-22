#include <Wire.h>

struct PinPair {
  int sda;
  int scl;
};

const PinPair CANDIDATES[] = {
  {8, 9},   // yang sedang dipakai di project
  {9, 8},
  {2, 3},   // umum di sebagian board C3
  {3, 2},
  {6, 7},   // alternatif board tertentu
  {7, 6},
  {0, 1},
  {1, 0},
};

const uint32_t I2C_SPEEDS[] = {100000, 50000, 400000};

void scanI2CForCurrentBus(int sda, int scl, uint32_t speed) {
  Serial.println();
  Serial.print("Memindai bus I2C pada SDA=");
  Serial.print(sda);
  Serial.print(" SCL=");
  Serial.print(scl);
  Serial.print(" @");
  Serial.print(speed);
  Serial.println("Hz");

  int found = 0;

  for (byte address = 1; address < 127; address++) {
    byte error;
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("Perangkat I2C ditemukan di alamat 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      found++;
      delay(5);
    } else if (error == 4) {
      Serial.print("Error tidak dikenal pada alamat 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
    }
  }

  if (found == 0) {
    Serial.println("-> Tidak ada perangkat I2C terdeteksi di kombinasi ini.");
  } else {
    Serial.print("-> Total perangkat I2C terdeteksi: ");
    Serial.println(found);
  }

  Serial.println("----------------------------------------");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("--- I2C Scanner ESP32-C3 (Auto Pin Scan) ---");
  Serial.println("Mencoba beberapa kombinasi SDA/SCL...");
  Serial.println("Jika ketemu 0x27/0x3F, gunakan pin itu di counter.ino");
}

void loop() {
  for (size_t i = 0; i < (sizeof(CANDIDATES) / sizeof(CANDIDATES[0])); i++) {
    for (size_t j = 0; j < (sizeof(I2C_SPEEDS) / sizeof(I2C_SPEEDS[0])); j++) {
      Wire.begin(CANDIDATES[i].sda, CANDIDATES[i].scl);
      Wire.setClock(I2C_SPEEDS[j]);
      delay(50);
      scanI2CForCurrentBus(CANDIDATES[i].sda, CANDIDATES[i].scl, I2C_SPEEDS[j]);
    }
  }

  Serial.println("Siklus scan selesai. Ulang 5 detik lagi...");
  Serial.println("========================================");
  delay(5000);
}
