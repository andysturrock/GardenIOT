#include <WiFiClientSecure.h>
#include <U8g2lib.h>
#include "arduino_secrets.h"

#define   FONT_ONE_HEIGHT               8                                   // font one height in pixels
#define   FONT_TWO_HEIGHT               20                                  // font two height in pixels

char      chBuffer[128];                                                    // general purpose character buffer
char      chPassword[] =                  __WIFIPASSWORD__;                 // your network password
char      chSSID[] =                      __WIFISSID__;                     // your network SSID
U8G2_SSD1306_128X64_NONAME_F_HW_I2C       u8g2(U8G2_R0, 16, 15, 4);         // OLED graphics
wl_status_t       wifiStatus =                   WL_IDLE_STATUS;                   // wifi status

String hostname = "api.gardeniot.dev.goatsinlace.com";

void setup()
{
  Serial.begin(115200);
  while (!Serial)
  {
    Serial.print('.');
  }

  // OLED graphics.

  u8g2.begin();
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.setFontRefHeightExtendedText();
  u8g2.setDrawColor(1);
  u8g2.setFontPosTop();
  u8g2.setFontDirection(0);

  // Wifi.

  // Display title.

  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to:");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  sprintf(chBuffer, "%s", chSSID);
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 31 - (FONT_ONE_HEIGHT / 2), chBuffer);
  u8g2.sendBuffer();

  // Connect to wifi.

  Serial.print("SSID is ");
  Serial.print(chSSID);
  Serial.print(", password is ");
  Serial.println(chPassword);
  Serial.print("GardenIOT: connecting to wifi...");
  wifiStatus = WiFi.begin(chSSID, chPassword);
  Serial.print(", Wifi begin returned:");
  Serial.println(wifiStatus);
  while (WiFi.status() != WL_CONNECTED)
  {
    // Serial.print(".");
    Serial.print(", Wifi status is:");
    Serial.println(WiFi.status());
    delay(500);
  }

  Serial.println();
  sprintf(chBuffer, "WiFi connected to %s.", chSSID);
  Serial.println(chBuffer);

  // Display connection stats.

  // Clean the display buffer.

  u8g2.clearBuffer();

  // Display the title.

  sprintf(chBuffer, "%s", "WiFi Stats:");
  Serial.println(chBuffer);
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);

  // Display the ip address assigned by the wifi router.

  char  chIp[81];
  WiFi.localIP().toString().toCharArray(chIp, sizeof(chIp) - 1);
  sprintf(chBuffer, "IP  : %s", chIp);
  Serial.println(chBuffer);
  u8g2.drawStr(0, FONT_ONE_HEIGHT * 2, chBuffer);

  // Display the ssid of the wifi router.

  sprintf(chBuffer, "SSID: %s", chSSID);
  Serial.println(chBuffer);
  u8g2.drawStr(0, FONT_ONE_HEIGHT * 3, chBuffer);

  // Now send the display buffer to the OLED.

  u8g2.sendBuffer();
}

void get()
{
  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to server...");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  u8g2.sendBuffer();

  WiFiClientSecure client;
  Serial.print("\nStarting connection to ");
  Serial.print(hostname.c_str());
  Serial.println("...");
  if (!client.connect(hostname.c_str(), 443)) {
    Serial.println("Connection failed!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection Failed");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();
  }
  else {
    Serial.println("Connected to server!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection made!");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    String url = "/0_0_1/temperature?sensor_id0";

    Serial.print("Requesting URL: ");
    Serial.println(url);

    // This will send the request to the server
    String http("GET " + url + " HTTP/1.1\n");
    http += "Host: " + hostname + "\n";
    http += "Connection: close\n\n";
    client.print(http);
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 5000) {
        Serial.println(">>> Client Timeout !");
        client.stop();
        return;
      }
    }

    while (client.connected()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") {
        Serial.println("headers received");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "headers received");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        break;
      }
    }
    // if there are incoming bytes available
    // from the server, read them and print them:
    u8g2.clearBuffer();
    String str;
    while (client.available()) {
      char c = client.read();
      // At end of response we seem to get a 255 so skip that.
      if(c == 255) {
        continue;
      }
      str.concat(c);
      Serial.print("c =<");
      Serial.write(c);
      Serial.println(">");
    }
    str.concat("\0");
    const char* c_str = str.c_str();
    Serial.write(c_str);
    sprintf(chBuffer, "%s", c_str);
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    client.stop();
  }
}

void post()
{
  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to server...");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  u8g2.sendBuffer();

  WiFiClientSecure client;
  Serial.println("\nStarting connection to server...");
  if (!client.connect(hostname.c_str(), 443)) {
    Serial.println("Connection failed!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection Failed");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();
  }
  else {
    Serial.println("Connected to server!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection made!");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    String url = "/0_0_1/temperature";

    Serial.print("POSTing to URL: ");
    Serial.println(url);

    String data("[");
    data += "{\"sensor_id\": 0, \"temperature\": \"12.99\"},";
    data += "{\"sensor_id\": 1, \"temperature\": \"23.99\"},";
    data += "{\"sensor_id\": 2, \"temperature\": \"34.99\"}";
    data += "]";

    // This will send the request to the server
    String http("POST " + url + " HTTP/1.1\n");
    http += "Host: " + hostname + "\n";
    http += "Connection: close\n";
    http += "Content-Length: ";
    http.concat(data.length());
    http += "\n\n";
    http += data;
    http += "\n";
    client.print(http);
    http += "\n\n";
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 10000) {
        Serial.println(">>> Client Timeout !");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "Timeout");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        client.stop();
        return;
      }
    }

    while (client.connected()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") {
        Serial.println("headers received");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "headers received");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        break;
      }
    }
    // if there are incoming bytes available
    // from the server, read them and print them:
    u8g2.clearBuffer();
    String str;
    while (client.available()) {
      char c = client.read();
      // At end of response we seem to get a 255 so skip that.
      if(c == 255) {
        continue;
      }
      str.concat(c);
      Serial.print("c =<");
      Serial.write(c);
      Serial.println(">");
    }
    str.concat("\0");
    const char* c_str = str.c_str();
    Serial.write(c_str);
    sprintf(chBuffer, "%s", c_str);
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    client.stop();
  }
}

void loop() {
  post();

  delay(5000);
}
