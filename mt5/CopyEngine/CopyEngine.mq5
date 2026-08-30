//+------------------------------------------------------------------+
//|                                                   CopyEngine.mq5 |
//|                                   Professional MT5 Copy Engine   |
//|                        Copyright 2026, Ultra-Fast MT5 Copy Cloud |
//+------------------------------------------------------------------+
#property copyright   "MT5 Copy Engine Pro"
#property link        "https://drdfsvprjrewemhzkink.supabase.co"
#property version     "2.60"
#property description "Account-level MT5 copy engine: one chart attachment copies the entire account"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//+------------------------------------------------------------------+
//| INTERNAL CLOUD CONFIGURATION (PROTECTED & HIDDEN)                |
//+------------------------------------------------------------------+
const string SUPABASE_PROJECT_URL = "https://drdfsvprjrewemhzkink.supabase.co";
const string SUPABASE_ANON_KEY    = "sb_publishable_iguy_M7cSoea6vasam_zmg_CYjpgUNU";
const int    HTTP_TIMEOUT_MS      = 2500;

//+------------------------------------------------------------------+
//| ENUMS & DEFINITIONS                                              |
//+------------------------------------------------------------------+
enum ENUM_COPY_ROLE
{
   ROLE_MASTER = 0, // Master Broadcaster (Streams trades & SL/TP changes to Cloud)
   ROLE_SLAVE  = 1  // Slave Receiver (Copies Master trades with independent risk)
};

enum ENUM_SLAVE_RISK_MODE
{
   RISK_MULTIPLIER    = 0, // Lot Multiplier (Slave Lot = Master Lot * Multiplier)
   RISK_FIXED_LOT     = 1, // Fixed Lot (Always trade fixed lot size)
   RISK_EQUITY_RATIO  = 2, // Equity Ratio (Scale by Slave Equity / Master Equity)
   RISK_USD_AMOUNT    = 3, // Risk USD (Calculate lot by SL distance & Risk USD)
   RISK_PERCENT       = 4  // Risk % of this account equity
};

enum ENUM_COPY_SOURCE
{
   COPY_ALL_ACCOUNT = 0,
   COPY_MANUAL_ONLY = 1,
   COPY_MAGIC_ONLY  = 2
};

//+------------------------------------------------------------------+
//| USER INPUT PARAMETERS (1-KEY SIMPLE CONNECTION)                  |
//+------------------------------------------------------------------+
input group "================ 1. ENGINE ROLE & CONNECTION KEY ================"
input ENUM_COPY_ROLE InpRole               = ROLE_MASTER;       // Engine Role (MASTER / SLAVE)
input string         InpAccountKey         = "";                // Connection Key: account UUID|secret token (from Web Dashboard)

input group "================ 2. SLAVE RISK MANAGEMENT ================"
input ENUM_SLAVE_RISK_MODE InpSlaveRiskMode= RISK_MULTIPLIER;   // Slave Sizing Mode
input double         InpLotMultiplier      = 1.0;               // Lot Multiplier (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
input double         InpFixedLotSize       = 0.01;              // Fixed Lot Size
input double         InpRiskUsdPerTrade    = 100.0;             // Risk USD per Trade (for USD mode)
input double         InpMinLotAllowed      = 0.01;              // Min Allowed Lot Size
input double         InpMaxLotAllowed      = 50.0;              // Max Allowed Lot Size
input bool           InpCopyStopLoss       = true;              // Copy & Sync Stop Loss in Real-time
input bool           InpCopyTakeProfit     = true;              // Copy & Sync Take Profit in Real-time
input int            InpMaxSlippagePoints  = 50;                // Max Slippage (points)
input bool           InpAutoSymbolMapping  = true;              // Auto Resolve Broker Suffix/Prefix

input group "================ 2b. MASTER COPY FILTER ================"
input ENUM_COPY_SOURCE InpCopySource       = COPY_ALL_ACCOUNT;  // What to copy from this account
input ulong          InpCopyMagicFilter    = 0;                 // Magic filter when COPY_MAGIC_ONLY

input group "================ 3. ENGINE TIMING & SAFETY ================"
input int            InpPollIntervalMs     = 250;               // Command Poll Interval (ms, 100-1000)
input int            InpStateHeartbeatSec  = 2;                 // State Telemetry Heartbeat (seconds)
input ulong          InpMagicNumber        = 887766;            // Magic Number for Copied Trades
input bool           InpEmergencyStop      = false;             // Emergency Stop (Block new copies)
input bool           InpShowChartHUD       = true;              // Display On-Chart Live Telemetry HUD
input bool           InpDebugLog           = false;             // Print Debug Logs in Experts Tab

//+------------------------------------------------------------------+
//| GLOBAL OBJECTS & ENGINE STATE                                    |
//+------------------------------------------------------------------+
CTrade         m_trade;
CPositionInfo  m_position;
COrderInfo     m_order;
CAccountInfo   m_account;
CSymbolInfo    m_sym;

// Master -> Slave Ticket Mapping Record
struct TicketMapEntry
{
   ulong    masterTicket;
   ulong    slaveTicket;
   string   masterSymbol;
   string   slaveSymbol;
   double   masterVolume;
   double   slaveVolume;
   datetime openTime;
};

TicketMapEntry g_ticketMap[];
int            g_mapCount = 0;

// Master SL/TP Snapshot Tracking
struct MasterPositionSnapshot
{
   ulong              ticket;
   double             volume;
   double             sl;
   double             tp;
   double             priceOpen;
   datetime           time;
   string             symbol;
   ENUM_POSITION_TYPE type;
};

MasterPositionSnapshot g_knownMasterPositions[];
int                    g_knownMasterCount = 0;
bool                   g_masterScanReady = false;
string                 g_publishedEventIds[];
int                    g_publishedCount = 0;
string                 g_symbolResolveError = "";

// Engine Runtime State
datetime g_lastHeartbeatTime   = 0;
uint     g_lastPollTick        = 0;
uint     g_lastStateTick       = 0;
bool     g_isOnline            = false;
string   g_lastStatusMessage   = "Initialized";
ulong    g_eventSequence       = 0;
int      g_consecutiveErrors   = 0;
bool     g_webrequestWarning   = false;
ENUM_SLAVE_RISK_MODE g_remoteRiskMode = RISK_MULTIPLIER;
double   g_remoteLotMultiplier = 1.0;
double   g_remoteFixedLot = 0.01;
double   g_remoteRiskUsd = 100.0;
double   g_remoteRiskPercent = 1.0;

struct PendingCopyEvent
{
   string action;
   ulong  ticket;
   string symbol;
   string side;
   double volume;
   double price;
   double sl;
   double tp;
   ulong  dealId;
   double remainingVolume;
};

PendingCopyEvent g_copyQueue[];
int              g_copyQueueCount = 0;

//+------------------------------------------------------------------+
//| JSON HELPER UTILITIES                                            |
//+------------------------------------------------------------------+
string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return value;
}

string ExtractJsonString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0)
   {
      search = "\"" + key + "\": \"";
      pos = StringFind(json, search);
   }
   if(pos < 0)
   {
      search = "\"" + key + "\" : \"";
      pos = StringFind(json, search);
   }
   if(pos < 0)
   {
      search = "\"" + key + "\" :\"";
      pos = StringFind(json, search);
   }
   if(pos < 0) return "";

   pos += StringLen(search);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0) return "";
   return StringSubstr(json, pos, endPos - pos);
}

double ExtractJsonDouble(string json, string key, double defaultValue = 0.0)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
   {
      search = "\"" + key + "\" :";
      pos = StringFind(json, search);
      if(pos < 0) return defaultValue;
   }
   pos += StringLen(search);
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '"' || StringGetCharacter(json, pos) == '\t'))
      pos++;
   int endPos = pos;
   while(endPos < StringLen(json))
   {
      ushort c = StringGetCharacter(json, endPos);
      if((c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+')
         endPos++;
      else
         break;
   }
   if(endPos <= pos) return defaultValue;
   return StringToDouble(StringSubstr(json, pos, endPos - pos));
}

bool ExtractJsonBool(string json, string key, bool defaultValue = false)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
   {
      search = "\"" + key + "\" :";
      pos = StringFind(json, search);
      if(pos < 0) return defaultValue;
   }
   pos += StringLen(search);
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '\t'))
      pos++;
   if(StringSubstr(json, pos, 4) == "true") return true;
   if(StringSubstr(json, pos, 5) == "false") return false;
   return defaultValue;
}

// Clean Key Input (removes leading/trailing whitespace)
string GetCleanKey()
{
   string k = InpAccountKey;
   StringTrimLeft(k);
   StringTrimRight(k);
   return k;
}

// The dashboard issues one pasteable credential in the form UUID|SECRET.
string GetAccountId()
{
   string key = GetCleanKey();
   int separator = StringFind(key, "|");
   if(separator < 0) return key;
   return StringSubstr(key, 0, separator);
}

string GetAccountToken()
{
   string key = GetCleanKey();
   int separator = StringFind(key, "|");
   if(separator < 0) return key;
   return StringSubstr(key, separator + 1);
}

//+------------------------------------------------------------------+
//| HTTP WEB REQUEST RPC EXECUTOR                                    |
//+------------------------------------------------------------------+
string HttpRpc(string rpcName, string jsonPayload, int timeoutMs = 0)
{
   string url = SUPABASE_PROJECT_URL + "/rest/v1/rpc/" + rpcName;
   string headers = "Content-Type: application/json\r\n" +
                    "apikey: " + SUPABASE_ANON_KEY + "\r\n" +
                    "Authorization: Bearer " + SUPABASE_ANON_KEY + "\r\n";

   char postData[];
   char responseData[];
   string responseHeaders;
   int timeout = (timeoutMs > 0 ? timeoutMs : HTTP_TIMEOUT_MS);

   StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(postData) > 0 && postData[ArraySize(postData)-1] == 0)
      ArrayResize(postData, ArraySize(postData)-1);

   ResetLastError();
   int httpCode = WebRequest("POST", url, headers, timeout, postData, responseData, responseHeaders);

   if(httpCode >= 200 && httpCode < 300)
   {
      string response = CharArrayToString(responseData, 0, -1, CP_UTF8);
      g_consecutiveErrors = 0;

      if(StringFind(response, "\"ok\":false") >= 0 || StringFind(response, "\"ok\": false") >= 0)
      {
         g_isOnline = false;
         g_lastStatusMessage = ExtractJsonString(response, "error");
         if(g_lastStatusMessage == "") g_lastStatusMessage = "Cloud RPC rejected the connection";
         if(InpDebugLog || g_consecutiveErrors == 0)
            PrintFormat("[CopyEngine] RPC %s rejected: %s", rpcName, response);
         return response;
      }

      if(rpcName == "ea_post_state")
      {
         g_isOnline = ExtractJsonBool(response, "online", false);
         g_lastStatusMessage = g_isOnline ? "Connected to cloud" : "Cloud connected; terminal is offline";
      }
      else if(g_lastStatusMessage == "Initialized")
      {
         g_lastStatusMessage = "Cloud reachable; waiting for state heartbeat";
      }
      return response;
   }
   else
   {
      g_consecutiveErrors++;
      if(g_consecutiveErrors > 3) g_isOnline = false;
      int err = GetLastError();
      g_lastStatusMessage = StringFormat("RPC %s failed (HTTP %d, error %d)", rpcName, httpCode, err);

      if(err == 4014) // ERR_FUNCTION_NOT_ALLOWED
      {
         if(!g_webrequestWarning)
         {
            PrintFormat("[CopyEngine] CRITICAL: WebRequest to '%s' is blocked by MT5!", SUPABASE_PROJECT_URL);
            Print("[CopyEngine] Fix: In MT5, go to Tools -> Options -> Expert Advisors, check 'Allow WebRequest for listed URL', and add '" + SUPABASE_PROJECT_URL + "'.");
            g_webrequestWarning = true;
         }
      }
      else if(InpDebugLog || g_consecutiveErrors <= 3)
      {
         PrintFormat("[CopyEngine] RPC %s failed (HTTP %d, Error %d). Response: %s",
                     rpcName, httpCode, err, CharArrayToString(responseData, 0, -1, CP_UTF8));
      }
      return "";
   }
}

//+------------------------------------------------------------------+
//| BROKER SYMBOL RESOLVER                                           |
//+------------------------------------------------------------------+
string StripBrokerDecorators(string symbol)
{
   string value = symbol;
   StringToUpper(value);
   StringReplace(value, ".", "");
   StringReplace(value, "+", "");
   StringReplace(value, "#", "");
   StringReplace(value, "-", "");
   StringReplace(value, "_", "");
   int len = StringLen(value);
   if(len > 6)
   {
      string tail = StringSubstr(value, len - 3);
      if(tail == "PRO" || tail == "RAW" || tail == "ECN")
         value = StringSubstr(value, 0, len - 3);
   }
   len = StringLen(value);
   if(len > 5 && StringGetCharacter(value, len - 1) == 'M')
      value = StringSubstr(value, 0, len - 1);
   len = StringLen(value);
   if(len > 6)
   {
      ushort last = StringGetCharacter(value, len - 1);
      if(last == 'C' || last == 'I' || last == 'S' || last == 'A' || last == 'B')
         value = StringSubstr(value, 0, len - 1);
   }
   return value;
}

bool IsKnownAliasPair(string a, string b)
{
   if(a == b) return true;
   if((a == "XAUUSD" && b == "GOLD") || (a == "GOLD" && b == "XAUUSD")) return true;
   if((a == "BTCUSD" && (b == "BTCUSDT" || b == "XBTUSD" || b == "BTC" || b == "BITCOIN")) ||
      ((a == "BTCUSDT" || a == "XBTUSD" || a == "BTC" || a == "BITCOIN") && b == "BTCUSD")) return true;
   if((a == "ETHUSD" && (b == "ETHUSDT" || b == "ETHEREUM")) ||
      ((a == "ETHUSDT" || a == "ETHEREUM") && b == "ETHUSD")) return true;
   if((a == "US30" && (b == "DJ30" || b == "WS30")) || ((a == "DJ30" || a == "WS30") && b == "US30")) return true;
   if((a == "NAS100" && (b == "USTEC" || b == "US100" || b == "NASDAQ")) ||
      ((a == "USTEC" || a == "US100" || a == "NASDAQ") && b == "NAS100")) return true;
   return false;
}

string ResolveLocalSymbol(string masterSymbol)
{
   g_symbolResolveError = "";
   if(masterSymbol == "")
   {
      g_symbolResolveError = "SYMBOL_MAPPING_EMPTY";
      return "";
   }

   if(m_sym.Name(masterSymbol) && m_sym.Select() && SymbolInfoInteger(masterSymbol, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED)
      return masterSymbol;

   if(!InpAutoSymbolMapping)
   {
      g_symbolResolveError = "SYMBOL_MAPPING_NOT_FOUND";
      return "";
   }

   string wanted = StripBrokerDecorators(masterSymbol);
   string matches[];
   int matchCount = 0;
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
   {
      string name = SymbolName(i, false);
      if(SymbolInfoInteger(name, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED)
         continue; // Filter out disabled/view-only instruments

      string normalized = StripBrokerDecorators(name);
      bool shareCore = (normalized == wanted || IsKnownAliasPair(wanted, normalized));
      if(!shareCore && StringLen(wanted) >= 6 && StringFind(normalized, wanted) == 0 && StringLen(normalized) <= StringLen(wanted) + 3)
         shareCore = true;
      if(shareCore)
      {
         ArrayResize(matches, matchCount + 1);
         matches[matchCount] = name;
         matchCount++;
      }
   }

   if(matchCount == 1)
   {
      m_sym.Name(matches[0]);
      m_sym.Select();
      return matches[0];
   }
   if(matchCount > 1)
   {
      string picked = matches[0];
      int pickedLen = StringLen(picked);
      for(int m = 0; m < matchCount; m++)
      {
         bool inWatch = false;
         int watched = SymbolsTotal(true);
         for(int w = 0; w < watched; w++)
         {
            if(SymbolName(w, true) == matches[m])
            {
               inWatch = true;
               break;
            }
         }
         int lenM = StringLen(matches[m]);
         if(inWatch || lenM < pickedLen)
         {
            picked = matches[m];
            pickedLen = lenM;
            if(inWatch) break;
         }
      }
      m_sym.Name(picked);
      m_sym.Select();
      PrintFormat("[CopyEngine] Mapped master symbol %s -> %s", masterSymbol, picked);
      return picked;
   }

   g_symbolResolveError = "SYMBOL_MAPPING_NOT_FOUND";
   return "";
}

//+------------------------------------------------------------------+
//| SLAVE LOT SIZING & RISK ENGINE                                   |
//+------------------------------------------------------------------+
double CalculateSlaveLot(string symbol, double masterLot, double masterSl, double masterPrice, ENUM_ORDER_TYPE orderType)
{
   if(!m_sym.Name(symbol) || !m_sym.Select())
      return MathMax(InpMinLotAllowed, InpFixedLotSize);

   double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = MathMin(InpMaxLotAllowed, SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX));
   double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(lotStep <= 0) lotStep = 0.01;

   double calcLot = InpFixedLotSize;

   if(g_remoteRiskMode == RISK_MULTIPLIER)
   {
      calcLot = masterLot * g_remoteLotMultiplier;
   }
   else if(g_remoteRiskMode == RISK_FIXED_LOT)
   {
      calcLot = g_remoteFixedLot;
   }
   else if(g_remoteRiskMode == RISK_EQUITY_RATIO)
   {
      calcLot = masterLot * g_remoteLotMultiplier;
   }
   else if(g_remoteRiskMode == RISK_USD_AMOUNT || g_remoteRiskMode == RISK_PERCENT)
   {
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      double tickVal = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double riskMoney = g_remoteRiskUsd;
      if(g_remoteRiskMode == RISK_PERCENT)
         riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * (g_remoteRiskPercent / 100.0);
      if(tickSize > 0 && point > 0 && masterSl > 0 && masterPrice > 0)
      {
         double slDistance = MathAbs(masterPrice - masterSl);
         double slPoints = slDistance / point;
         double pointValuePerLot = (tickVal / tickSize) * point;
         if(slPoints > 0 && pointValuePerLot > 0)
         {
            calcLot = riskMoney / (slPoints * pointValuePerLot);
         }
      }
   }

   // Normalize to broker volume step
   calcLot = MathFloor(calcLot / lotStep + 0.000001) * lotStep;
   if(calcLot < minLot) calcLot = minLot;
   if(calcLot > maxLot) calcLot = maxLot;

   return NormalizeDouble(calcLot, 2);
}

void ApplyRemoteRiskSettings(string payload)
{
   string mode = ExtractJsonString(payload, "mode");
   if(mode == "MULTIPLIER") g_remoteRiskMode = RISK_MULTIPLIER;
   else if(mode == "FIXED" || mode == "FIXED_LOT") g_remoteRiskMode = RISK_FIXED_LOT;
   else if(mode == "EQUITY_RATIO" || mode == "BALANCE_RATIO") g_remoteRiskMode = RISK_EQUITY_RATIO;
   else if(mode == "RISK_USD") g_remoteRiskMode = RISK_USD_AMOUNT;
   else if(mode == "RISK_PERCENT") g_remoteRiskMode = RISK_PERCENT;

   double multiplier = ExtractJsonDouble(payload, "multiplier", g_remoteLotMultiplier);
   double fixedLot = ExtractJsonDouble(payload, "lot", g_remoteFixedLot);
   double riskUsd = ExtractJsonDouble(payload, "risk_usd", g_remoteRiskUsd);
   double riskPercent = ExtractJsonDouble(payload, "risk_percent", g_remoteRiskPercent);

   if(multiplier > 0) g_remoteLotMultiplier = multiplier;
   if(fixedLot > 0) g_remoteFixedLot = fixedLot;
   if(riskUsd > 0) g_remoteRiskUsd = riskUsd;
   if(riskPercent > 0) g_remoteRiskPercent = riskPercent;
}

//+------------------------------------------------------------------+
//| TICKET MAPPING STORAGE & RESOLUTION                              |
//+------------------------------------------------------------------+
void PersistTicketMap()
{
   string fileName = "copy_map_" + GetAccountId() + ".csv";
   int handle = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON, ',');
   if(handle == INVALID_HANDLE) return;
   for(int i = 0; i < g_mapCount; i++)
   {
      FileWrite(handle,
                IntegerToString((long)g_ticketMap[i].masterTicket),
                IntegerToString((long)g_ticketMap[i].slaveTicket),
                g_ticketMap[i].masterSymbol,
                g_ticketMap[i].slaveSymbol,
                DoubleToString(g_ticketMap[i].masterVolume, 2),
                DoubleToString(g_ticketMap[i].slaveVolume, 2));
   }
   FileClose(handle);
}

void LoadTicketMap()
{
   string fileName = "copy_map_" + GetAccountId() + ".csv";
   int handle = FileOpen(fileName, FILE_READ | FILE_CSV | FILE_ANSI | FILE_COMMON, ',');
   if(handle == INVALID_HANDLE) return;
   g_mapCount = 0;
   ArrayResize(g_ticketMap, 0);
   while(!FileIsEnding(handle))
   {
      ulong masterTicket = (ulong)StringToInteger(FileReadString(handle));
      ulong slaveTicket = (ulong)StringToInteger(FileReadString(handle));
      string masterSym = FileReadString(handle);
      string slaveSym = FileReadString(handle);
      double masterVol = StringToDouble(FileReadString(handle));
      double slaveVol = StringToDouble(FileReadString(handle));
      if(masterTicket == 0) continue;
      ArrayResize(g_ticketMap, g_mapCount + 1);
      g_ticketMap[g_mapCount].masterTicket = masterTicket;
      g_ticketMap[g_mapCount].slaveTicket = slaveTicket;
      g_ticketMap[g_mapCount].masterSymbol = masterSym;
      g_ticketMap[g_mapCount].slaveSymbol = slaveSym;
      g_ticketMap[g_mapCount].masterVolume = masterVol;
      g_ticketMap[g_mapCount].slaveVolume = slaveVol;
      g_mapCount++;
   }
   FileClose(handle);
}

void AddTicketMapping(ulong masterTicket, ulong slaveTicket, string masterSym, string slaveSym, double masterVol, double slaveVol)
{
   for(int i = 0; i < g_mapCount; i++)
   {
      if(g_ticketMap[i].masterTicket == masterTicket)
      {
         g_ticketMap[i].slaveTicket = slaveTicket;
         g_ticketMap[i].slaveVolume = slaveVol;
         return;
      }
   }
   ArrayResize(g_ticketMap, g_mapCount + 1);
   g_ticketMap[g_mapCount].masterTicket = masterTicket;
   g_ticketMap[g_mapCount].slaveTicket  = slaveTicket;
   g_ticketMap[g_mapCount].masterSymbol = masterSym;
   g_ticketMap[g_mapCount].slaveSymbol  = slaveSym;
   g_ticketMap[g_mapCount].masterVolume = masterVol;
   g_ticketMap[g_mapCount].slaveVolume  = slaveVol;
   g_ticketMap[g_mapCount].openTime     = TimeCurrent();
   g_mapCount++;
   PersistTicketMap();
}

ulong FindSlaveTicket(ulong masterTicket)
{
   for(int i = 0; i < g_mapCount; i++)
   {
      if(g_ticketMap[i].masterTicket == masterTicket)
         return g_ticketMap[i].slaveTicket;
   }
   return 0;
}

void RemoveTicketMapping(ulong masterTicket)
{
   int foundIdx = -1;
   for(int i = 0; i < g_mapCount; i++)
   {
      if(g_ticketMap[i].masterTicket == masterTicket)
      {
         foundIdx = i;
         break;
      }
   }
   if(foundIdx >= 0)
   {
      for(int i = foundIdx; i < g_mapCount - 1; i++)
         g_ticketMap[i] = g_ticketMap[i + 1];
      g_mapCount--;
      ArrayResize(g_ticketMap, g_mapCount);
      PersistTicketMap();
   }
}

// Universal executed position ticket resolver compatible with all MT5 builds
ulong GetExecutedPositionTicket(ulong masterTicket = 0, string symbol = "")
{
   ulong dealTicket = m_trade.ResultDeal();
   if(dealTicket > 0)
   {
      if(HistoryDealSelect(dealTicket))
      {
         ulong posId = (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
         if(posId > 0 && m_position.SelectByTicket(posId))
            return posId;
      }
   }

   ulong orderTicket = m_trade.ResultOrder();
   if(orderTicket > 0 && m_position.SelectByTicket(orderTicket))
      return orderTicket;

   if(masterTicket > 0)
   {
      string needle = "Copy #" + IntegerToString((long)masterTicket);
      int total = PositionsTotal();
      for(int i = 0; i < total; i++)
      {
         if(m_position.SelectByIndex(i) && StringFind(m_position.Comment(), needle) >= 0)
            return m_position.Ticket();
      }
   }

   if(dealTicket > 0)
      return dealTicket;

   if(orderTicket > 0)
      return orderTicket;

   return 0;
}

//+------------------------------------------------------------------+
//| STATE & TELEMETRY BROADCASTER                                    |
//+------------------------------------------------------------------+
void PostAccountState()
{
   string accountId = GetAccountId();
   string token = GetAccountToken();
   if(accountId == "" || token == "") return;

   string positionsJson = "[";
   int totalPos = PositionsTotal();
   int count = 0;

   for(int i = 0; i < totalPos; i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(count > 0) positionsJson += ",";
         positionsJson += StringFormat(
            "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,\"priceOpen\":%.5f,\"priceCurrent\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"magic\":%I64u,\"time\":%I64d}",
            m_position.Ticket(),
            JsonEscape(m_position.Symbol()),
            m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL",
            m_position.Volume(),
            m_position.PriceOpen(),
            m_position.PriceCurrent(),
            m_position.StopLoss(),
            m_position.TakeProfit(),
            m_position.Profit(),
            m_position.Magic(),
            (long)m_position.Time()
         );
         count++;
      }
   }
   positionsJson += "]";

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double openPl = equity - balance;

   bool terminalConnected = (bool)TerminalInfoInteger(TERMINAL_CONNECTED);
   bool terminalTradeAllowed = (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED);
   bool algoTradingAllowed = terminalTradeAllowed && (bool)MQLInfoInteger(MQL_TRADE_ALLOWED);
   bool accountTradeAllowed = (bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
   bool tradeAllowed = terminalConnected && algoTradingAllowed && accountTradeAllowed;

   string stateJson = StringFormat(
      "{\"role\":\"%s\",\"symbol\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"freeMargin\":%.2f,\"openPL\":%.2f,\"positionsTotal\":%d,\"pendingOrders\":%d,\"marginMode\":\"%s\",\"currency\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\",\"accountNumber\":\"%I64u\",\"version\":\"2.60\",\"status\":\"%s\",\"arm\":\"%s\",\"positions\":%s,\"spread\":%d,\"tradeAllowed\":%s,\"terminalConnected\":%s,\"terminalTradeAllowed\":%s,\"algoTradingAllowed\":%s,\"accountTradeAllowed\":%s,\"copyScope\":\"ACCOUNT\"}",
      InpRole == ROLE_MASTER ? "MASTER" : "SLAVE",
      JsonEscape(_Symbol),
      balance,
      equity,
      freeMargin,
      openPl,
      totalPos,
      OrdersTotal(),
      (AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING) ? "HEDGING" : "NETTING",
      JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)),
      JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      tradeAllowed ? "ONLINE" : "OFFLINE",
      "OFF",
      positionsJson,
      (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD),
      tradeAllowed ? "true" : "false",
      terminalConnected ? "true" : "false",
      terminalTradeAllowed ? "true" : "false",
      algoTradingAllowed ? "true" : "false",
      accountTradeAllowed ? "true" : "false"
   );

   string rpcBody = StringFormat(
      "{\"p_account_id\":\"%s\",\"p_token\":\"%s\",\"p_state\":%s}",
      JsonEscape(accountId),
      JsonEscape(token),
      stateJson
   );

   HttpRpc("ea_post_state", rpcBody);
}

//+------------------------------------------------------------------+
//| MASTER/SLAVE: POST IMMEDIATE OFFLINE STATE                       |
//+------------------------------------------------------------------+
void PostAccountOfflineState()
{
   string accountId = GetAccountId();
   string token = GetAccountToken();
   if(accountId == "" || token == "") return;

   string stateJson = StringFormat(
      "{\"status\":\"OFFLINE\",\"role\":\"%s\",\"accountLogin\":%I64d,\"symbol\":\"%s\"}",
      InpRole == ROLE_MASTER ? "MASTER" : "SLAVE",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEscape(_Symbol)
   );

   string rpcBody = StringFormat(
      "{\"p_account_id\":\"%s\",\"p_token\":\"%s\",\"p_state\":%s}",
      JsonEscape(accountId),
      JsonEscape(token),
      stateJson
   );

   HttpRpc("ea_post_state", rpcBody);
}

//+------------------------------------------------------------------+
//| MASTER BROADCAST: PUBLISH TRADE EVENT                            |
//+------------------------------------------------------------------+
bool WasPublished(string eventId)
{
   for(int i = 0; i < g_publishedCount; i++)
   {
      if(g_publishedEventIds[i] == eventId)
         return true;
   }
   return false;
}

void RememberPublished(string eventId)
{
   if(eventId == "" || WasPublished(eventId)) return;
   ArrayResize(g_publishedEventIds, g_publishedCount + 1);
   g_publishedEventIds[g_publishedCount] = eventId;
   g_publishedCount++;
}

string BuildLogicalEventId(string action, ulong ticket, double sl, double tp, double remainingVolume)
{
   string accountId = GetAccountId();
   if(action == "OPEN_MARKET")
      return StringFormat("%s|OPEN_MARKET|%I64u", accountId, ticket);
   if(action == "CLOSE_MARKET")
      return StringFormat("%s|CLOSE_MARKET|%I64u", accountId, ticket);
   if(action == "PARTIAL_CLOSE")
      return StringFormat("%s|PARTIAL_CLOSE|%I64u|%.2f", accountId, ticket, remainingVolume);
   if(action == "MODIFY_SL_TP")
      return StringFormat("%s|MODIFY_SL_TP|%I64u|%.5f|%.5f", accountId, ticket, sl, tp);
   return StringFormat("%s|%s|%I64u", accountId, action, ticket);
}

bool ShouldCopyMasterTrade(ulong magic, string comment)
{
   if(StringFind(comment, "Copy #") >= 0)
      return false;
   if(InpCopySource == COPY_MANUAL_ONLY)
      return (magic == 0);
   if(InpCopySource == COPY_MAGIC_ONLY)
      return (magic == InpCopyMagicFilter);
   return true;
}

ulong ResolveCloseTicket(ulong ticket, string reqSym, string side);

void ApplySymbolFilling(string symbol)
{
   long filling = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((filling & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      m_trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

void EnqueueMasterCopyEvent(string action, ulong ticket, string symbol, string side, double volume, double price, double sl, double tp, ulong dealId = 0, double remainingVolume = 0)
{
   if(InpRole != ROLE_MASTER || symbol == "") return;
   string eventId = BuildLogicalEventId(action, ticket, sl, tp, remainingVolume);
   if(WasPublished(eventId)) return;
   for(int i = 0; i < g_copyQueueCount; i++)
   {
      if(g_copyQueue[i].action == action && g_copyQueue[i].ticket == ticket &&
         MathAbs(g_copyQueue[i].sl - sl) < 0.0000001 && MathAbs(g_copyQueue[i].tp - tp) < 0.0000001)
         return;
   }
   ArrayResize(g_copyQueue, g_copyQueueCount + 1);
   g_copyQueue[g_copyQueueCount].action = action;
   g_copyQueue[g_copyQueueCount].ticket = ticket;
   g_copyQueue[g_copyQueueCount].symbol = symbol;
   g_copyQueue[g_copyQueueCount].side = side;
   g_copyQueue[g_copyQueueCount].volume = volume;
   g_copyQueue[g_copyQueueCount].price = price;
   g_copyQueue[g_copyQueueCount].sl = sl;
   g_copyQueue[g_copyQueueCount].tp = tp;
   g_copyQueue[g_copyQueueCount].dealId = dealId;
   g_copyQueue[g_copyQueueCount].remainingVolume = remainingVolume;
   g_copyQueueCount++;
}

void FlushMasterCopyQueue();

void MasterPublishEvent(string action, ulong ticket, string symbol, string side, double volume, double price, double sl, double tp, ulong dealId = 0, double remainingVolume = 0)
{
   string accountId = GetAccountId();
   string token = GetAccountToken();
   if(InpRole != ROLE_MASTER || accountId == "" || token == "") return;
   if(symbol == "") return;

   string eventId = BuildLogicalEventId(action, ticket, sl, tp, remainingVolume);
   if(WasPublished(eventId))
      return;

   if(g_eventSequence == 0) g_eventSequence = (ulong)TimeCurrent() * 1000;
   else g_eventSequence++;

   double symPoint = SymbolInfoDouble(symbol, SYMBOL_POINT);
   if(symPoint <= 0) symPoint = _Point;

   double slPoints = 0.0;
   double tpPoints = 0.0;

   if(sl > 0 && price > 0 && symPoint > 0)
      slPoints = MathAbs(price - sl) / symPoint;

   if(tp > 0 && price > 0 && symPoint > 0)
      tpPoints = MathAbs(tp - price) / symPoint;

   double slDistance = 0.0;
   double tpDistance = 0.0;
   if(sl > 0 && price > 0) slDistance = MathAbs(price - sl);
   if(tp > 0 && price > 0) tpDistance = MathAbs(tp - price);

   string eventJson = StringFormat(
      "{\"event_id\":\"%s\",\"master_position_id\":\"%I64u\",\"deal_id\":\"%I64u\",\"action\":\"%s\",\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,\"price\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"sl_points\":%.1f,\"tp_points\":%.1f,\"sl_distance\":%.5f,\"tp_distance\":%.5f,\"sequence\":%I64u,\"timestamp\":%I64d,\"copy_scope\":\"ACCOUNT\"}",
      eventId,
      ticket,
      dealId,
      JsonEscape(action),
      JsonEscape(symbol),
      JsonEscape(side),
      volume,
      price,
      sl,
      tp,
      slPoints,
      tpPoints,
      slDistance,
      tpDistance,
      g_eventSequence,
      (long)TimeCurrent()
   );

   string rpcBody = StringFormat(
      "{\"p_account_id\":\"%s\",\"p_token\":\"%s\",\"p_event\":%s}",
      JsonEscape(accountId),
      JsonEscape(token),
      eventJson
   );

   PrintFormat("[Master] Broadcasting %s for Ticket #%I64u on %s (Vol: %.2f, SL: %.5f [%.1f pts], TP: %.5f [%.1f pts])",
               action, ticket, symbol, volume, sl, slPoints, tp, tpPoints);

   string response = HttpRpc("publish_master_event", rpcBody, 8000);
   bool ok = (StringFind(response, "\"ok\":true") >= 0 || StringFind(response, "\"ok\": true") >= 0);
   if(!ok)
   {
      PrintFormat("[Master] Copy broadcast FAILED for %s #%I64u: %s", action, ticket, response);
      g_lastStatusMessage = "Copy broadcast failed";
      EnqueueMasterCopyEvent(action, ticket, symbol, side, volume, price, sl, tp, dealId, remainingVolume);
      return;
   }

   RememberPublished(eventId);
   int notified = (int)ExtractJsonDouble(response, "slaves_notified", 0);
   g_lastStatusMessage = "Copied " + action + " #" + IntegerToString((long)ticket) + " to " + IntegerToString(notified) + " account(s)";
   PrintFormat("[Master] Copied %s #%I64u to %d slave/follower account(s)", action, ticket, notified);
   if(notified <= 0)
      Print("[Master] WARNING: cloud accepted the trade but no COPY ON slave is linked to this master.");
}

void FlushMasterCopyQueue()
{
   if(g_copyQueueCount <= 0) return;
   int n = g_copyQueueCount;
   PendingCopyEvent batch[];
   ArrayResize(batch, n);
   for(int i = 0; i < n; i++)
      batch[i] = g_copyQueue[i];
   g_copyQueueCount = 0;
   ArrayResize(g_copyQueue, 0);
   for(int i = 0; i < n; i++)
   {
      MasterPublishEvent(
         batch[i].action,
         batch[i].ticket,
         batch[i].symbol,
         batch[i].side,
         batch[i].volume,
         batch[i].price,
         batch[i].sl,
         batch[i].tp,
         batch[i].dealId,
         batch[i].remainingVolume
      );
   }
}

int FindKnownMasterIndex(ulong ticket)
{
   for(int k = 0; k < g_knownMasterCount; k++)
   {
      if(g_knownMasterPositions[k].ticket == ticket)
         return k;
   }
   return -1;
}

void RememberMasterPosition(const MasterPositionSnapshot &snap)
{
   int idx = FindKnownMasterIndex(snap.ticket);
   if(idx >= 0)
   {
      g_knownMasterPositions[idx] = snap;
      return;
   }
   g_knownMasterCount++;
   ArrayResize(g_knownMasterPositions, g_knownMasterCount);
   g_knownMasterPositions[g_knownMasterCount - 1] = snap;
}

void ForgetMasterPosition(ulong ticket)
{
   int idx = FindKnownMasterIndex(ticket);
   if(idx < 0) return;
   for(int i = idx; i < g_knownMasterCount - 1; i++)
      g_knownMasterPositions[i] = g_knownMasterPositions[i + 1];
   g_knownMasterCount--;
   ArrayResize(g_knownMasterPositions, g_knownMasterCount);
}

MasterPositionSnapshot CaptureOpenPosition()
{
   MasterPositionSnapshot snap;
   snap.ticket = m_position.Ticket();
   snap.volume = m_position.Volume();
   snap.sl = m_position.StopLoss();
   snap.tp = m_position.TakeProfit();
   snap.priceOpen = m_position.PriceOpen();
   snap.time = m_position.Time();
   snap.symbol = m_position.Symbol();
   snap.type = m_position.PositionType();
   return snap;
}

void EnsureSymbolWatch(string symbol)
{
   if(symbol == "") return;
   SymbolSelect(symbol, true);
}

//+------------------------------------------------------------------+
//| MASTER: SCAN ALL ACCOUNT POSITIONS (NOT CHART SYMBOL ONLY)       |
//+------------------------------------------------------------------+
void MasterScanPositionModifications()
{
   if(InpRole != ROLE_MASTER) return;

   int currentTotal = PositionsTotal();
   MasterPositionSnapshot currentStates[];
   ArrayResize(currentStates, currentTotal);
   int captured = 0;

   for(int i = 0; i < currentTotal; i++)
   {
      if(!m_position.SelectByIndex(i))
         continue;

      MasterPositionSnapshot snap = CaptureOpenPosition();
      EnsureSymbolWatch(snap.symbol);
      currentStates[captured] = snap;
      captured++;

      if(!g_masterScanReady)
         continue;

      int knownIdx = FindKnownMasterIndex(snap.ticket);
      string side = (snap.type == POSITION_TYPE_BUY ? "BUY" : "SELL");
      string openEventId = BuildLogicalEventId("OPEN_MARKET", snap.ticket, snap.sl, snap.tp, 0);
      if(knownIdx < 0 || !WasPublished(openEventId))
      {
         if(ShouldCopyMasterTrade(m_position.Magic(), m_position.Comment()))
            MasterPublishEvent("OPEN_MARKET", snap.ticket, snap.symbol, side, snap.volume, snap.priceOpen, snap.sl, snap.tp);
         if(knownIdx < 0)
            continue;
      }

      bool slChanged = MathAbs(g_knownMasterPositions[knownIdx].sl - snap.sl) > 0.000001;
      bool tpChanged = MathAbs(g_knownMasterPositions[knownIdx].tp - snap.tp) > 0.000001;
      bool volReduced = (g_knownMasterPositions[knownIdx].volume - snap.volume) > 0.001;

      if(slChanged || tpChanged)
      {
         string side = (snap.type == POSITION_TYPE_BUY ? "BUY" : "SELL");
         MasterPublishEvent("MODIFY_SL_TP", snap.ticket, snap.symbol, side, snap.volume, snap.priceOpen, snap.sl, snap.tp);
      }

      if(volReduced)
      {
         double closedPart = g_knownMasterPositions[knownIdx].volume - snap.volume;
         string side = (snap.type == POSITION_TYPE_BUY ? "BUY" : "SELL");
         MasterPublishEvent("PARTIAL_CLOSE", snap.ticket, snap.symbol, side, closedPart, m_position.PriceCurrent(), snap.sl, snap.tp, 0, snap.volume);
      }
   }

   if(g_masterScanReady)
   {
      for(int k = g_knownMasterCount - 1; k >= 0; k--)
      {
         ulong knownTicket = g_knownMasterPositions[k].ticket;
         bool stillOpen = false;
         for(int c = 0; c < captured; c++)
         {
            if(currentStates[c].ticket == knownTicket)
            {
               stillOpen = true;
               break;
            }
         }
         if(!stillOpen)
         {
            string side = (g_knownMasterPositions[k].type == POSITION_TYPE_BUY ? "BUY" : "SELL");
            MasterPublishEvent("CLOSE_MARKET", knownTicket, g_knownMasterPositions[k].symbol, side, g_knownMasterPositions[k].volume, 0, 0, 0);
         }
      }
   }

   g_knownMasterCount = captured;
   ArrayResize(g_knownMasterPositions, g_knownMasterCount);
   for(int i = 0; i < g_knownMasterCount; i++)
      g_knownMasterPositions[i] = currentStates[i];
   g_masterScanReady = true;
}

//+------------------------------------------------------------------+
//| SLAVE: COMMAND ACKNOWLEDGMENT                                    |
//+------------------------------------------------------------------+
void AcknowledgeCommand(string commandId, string status, string message = "")
{
   string accountId = GetAccountId();
   string token = GetAccountToken();
   if(commandId == "" || accountId == "" || token == "") return;

   string rpcBody = StringFormat(
      "{\"p_command_id\":\"%s\",\"p_account_id\":\"%s\",\"p_token\":\"%s\",\"p_status\":\"%s\",\"p_message\":\"%s\"}",
      JsonEscape(commandId),
      JsonEscape(accountId),
      JsonEscape(token),
      JsonEscape(status),
      JsonEscape(message)
   );

   HttpRpc("ea_ack_command", rpcBody);
}

//+------------------------------------------------------------------+
//| SLAVE: EXECUTE COPY OPEN (MULTI-BROKER POINT-BASED SL/TP)        |
//+------------------------------------------------------------------+
void ExecuteSlaveCopyOpen(string commandId, string payload)
{
   if(InpEmergencyStop)
   {
      AcknowledgeCommand(commandId, "failed", "Emergency stop active on slave");
      return;
   }

   ulong masterTicket = (ulong)ExtractJsonDouble(payload, "master_ticket", 0);
   string masterSym   = ExtractJsonString(payload, "symbol");
   string side        = ExtractJsonString(payload, "side");
   double masterVol   = ExtractJsonDouble(payload, "volume", 0.01);
   double masterPrice = ExtractJsonDouble(payload, "price", 0.0);
   double sl          = ExtractJsonDouble(payload, "sl", 0.0);
   double tp          = ExtractJsonDouble(payload, "tp", 0.0);
   double slPoints    = ExtractJsonDouble(payload, "sl_points", 0.0);
   double tpPoints    = ExtractJsonDouble(payload, "tp_points", 0.0);
   double slDistance  = ExtractJsonDouble(payload, "sl_distance", 0.0);
   double tpDistance  = ExtractJsonDouble(payload, "tp_distance", 0.0);
   ApplyRemoteRiskSettings(payload);

   if(FindSlaveTicket(masterTicket) != 0)
   {
      AcknowledgeCommand(commandId, "done", "Idempotent skip: master ticket already mapped");
      return;
   }

   string localSym = ResolveLocalSymbol(masterSym);
   if(localSym == "")
   {
      AcknowledgeCommand(commandId, "failed", g_symbolResolveError + " for " + masterSym);
      return;
   }
   EnsureSymbolWatch(localSym);
   if(!m_sym.Name(localSym) || !m_sym.Select())
   {
      AcknowledgeCommand(commandId, "failed", "SYMBOL_MAPPING_NOT_FOUND: " + masterSym);
      return;
   }
   if(!SymbolInfoInteger(localSym, SYMBOL_TRADE_MODE))
   {
      AcknowledgeCommand(commandId, "failed", "SYMBOL_TRADE_DISABLED: " + localSym);
      return;
   }

   ENUM_ORDER_TYPE oType = (side == "BUY" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   double slaveLot = CalculateSlaveLot(localSym, masterVol, sl, masterPrice, oType);

   double localPoint = SymbolInfoDouble(localSym, SYMBOL_POINT);
   if(localPoint <= 0) localPoint = _Point;
   int localDigits = (int)SymbolInfoInteger(localSym, SYMBOL_DIGITS);
   double stopLevel = (double)SymbolInfoInteger(localSym, SYMBOL_TRADE_STOPS_LEVEL) * localPoint;
   double freezeLevel = (double)SymbolInfoInteger(localSym, SYMBOL_TRADE_FREEZE_LEVEL) * localPoint;
   double minStopsDistance = MathMax(stopLevel, freezeLevel);

   // Derive point / distance deltas
   if(slDistance <= 0 && sl > 0 && masterPrice > 0)
      slDistance = MathAbs(masterPrice - sl);
   if(tpDistance <= 0 && tp > 0 && masterPrice > 0)
      tpDistance = MathAbs(tp - masterPrice);
   if(slPoints <= 0 && slDistance > 0 && localPoint > 0)
      slPoints = slDistance / localPoint;
   if(tpPoints <= 0 && tpDistance > 0 && localPoint > 0)
      tpPoints = tpDistance / localPoint;

   m_trade.SetDeviationInPoints(InpMaxSlippagePoints);
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   ApplySymbolFilling(localSym);

   bool success = false;
   double setSL = 0.0;
   double setTP = 0.0;

   // Direct market buy/sell at slave broker's current live price
   if(side == "BUY")
   {
      double ask = SymbolInfoDouble(localSym, SYMBOL_ASK);
      double bid = SymbolInfoDouble(localSym, SYMBOL_BID);

      if(InpCopyStopLoss)
      {
         if(slPoints > 0)
            setSL = NormalizeDouble(ask - (slPoints * localPoint), localDigits);
         else if(slDistance > 0)
            setSL = NormalizeDouble(ask - slDistance, localDigits);

         if(setSL > 0 && minStopsDistance > 0 && (bid - setSL) < minStopsDistance)
            setSL = NormalizeDouble(bid - minStopsDistance, localDigits);
      }

      if(InpCopyTakeProfit)
      {
         if(tpPoints > 0)
            setTP = NormalizeDouble(ask + (tpPoints * localPoint), localDigits);
         else if(tpDistance > 0)
            setTP = NormalizeDouble(ask + tpDistance, localDigits);

         if(setTP > 0 && minStopsDistance > 0 && (setTP - bid) < minStopsDistance)
            setTP = NormalizeDouble(bid + minStopsDistance, localDigits);
      }

      success = m_trade.Buy(slaveLot, localSym, ask, setSL, setTP, "Copy #" + IntegerToString((long)masterTicket));

      // ECN / Market Execution fallback: If broker rejects SL/TP on market entry, open first then modify
      if(!success && (m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS || m_trade.ResultRetcode() == 10016 || m_trade.ResultRetcode() == 10029))
      {
         Print("[Slave] Broker rejected initial stops. Executing market order first...");
         success = m_trade.Buy(slaveLot, localSym, ask, 0, 0, "Copy #" + IntegerToString((long)masterTicket));
         if(success && (setSL > 0 || setTP > 0))
         {
            ulong posTgt = GetExecutedPositionTicket(masterTicket, localSym);
            if(posTgt > 0)
            {
               Sleep(50);
               m_trade.PositionModify(posTgt, setSL, setTP);
            }
         }
      }

      // Filling mode fallback: If broker rejects filling mode, cycle through all supported modes
      if(!success && (m_trade.ResultRetcode() == 10030 || m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_FILL))
      {
         ENUM_ORDER_TYPE_FILLING fillingModes[] = {ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN};
         for(int f = 0; f < 3 && !success; f++)
         {
            m_trade.SetTypeFilling(fillingModes[f]);
            ask = SymbolInfoDouble(localSym, SYMBOL_ASK);
            success = m_trade.Buy(slaveLot, localSym, ask, setSL, setTP, "Copy #" + IntegerToString((long)masterTicket));
         }
      }
   }
   else // SELL
   {
      double bid = SymbolInfoDouble(localSym, SYMBOL_BID);
      double ask = SymbolInfoDouble(localSym, SYMBOL_ASK);

      if(InpCopyStopLoss)
      {
         if(slPoints > 0)
            setSL = NormalizeDouble(bid + (slPoints * localPoint), localDigits);
         else if(slDistance > 0)
            setSL = NormalizeDouble(bid + slDistance, localDigits);

         if(setSL > 0 && minStopsDistance > 0 && (setSL - ask) < minStopsDistance)
            setSL = NormalizeDouble(ask + minStopsDistance, localDigits);
      }

      if(InpCopyTakeProfit)
      {
         if(tpPoints > 0)
            setTP = NormalizeDouble(bid - (tpPoints * localPoint), localDigits);
         else if(tpDistance > 0)
            setTP = NormalizeDouble(bid - tpDistance, localDigits);

         if(setTP > 0 && minStopsDistance > 0 && (ask - setTP) < minStopsDistance)
            setTP = NormalizeDouble(ask - minStopsDistance, localDigits);
      }

      success = m_trade.Sell(slaveLot, localSym, bid, setSL, setTP, "Copy #" + IntegerToString((long)masterTicket));

      // ECN / Market Execution fallback
      if(!success && (m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS || m_trade.ResultRetcode() == 10016 || m_trade.ResultRetcode() == 10029))
      {
         Print("[Slave] Broker rejected initial stops. Executing market order first...");
         success = m_trade.Sell(slaveLot, localSym, bid, 0, 0, "Copy #" + IntegerToString((long)masterTicket));
         if(success && (setSL > 0 || setTP > 0))
         {
            ulong posTgt = GetExecutedPositionTicket(masterTicket, localSym);
            if(posTgt > 0)
            {
               Sleep(50);
               m_trade.PositionModify(posTgt, setSL, setTP);
            }
         }
      }

      // Filling mode fallback
      if(!success && (m_trade.ResultRetcode() == 10030 || m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_FILL))
      {
         ENUM_ORDER_TYPE_FILLING fillingModes[] = {ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN};
         for(int f = 0; f < 3 && !success; f++)
         {
            m_trade.SetTypeFilling(fillingModes[f]);
            bid = SymbolInfoDouble(localSym, SYMBOL_BID);
            success = m_trade.Sell(slaveLot, localSym, bid, setSL, setTP, "Copy #" + IntegerToString((long)masterTicket));
         }
      }
   }

   if(success)
   {
      ulong slaveTicket = GetExecutedPositionTicket(masterTicket, localSym);

      AddTicketMapping(masterTicket, slaveTicket, masterSym, localSym, masterVol, slaveLot);

      string msg = StringFormat("Copied %s %.2f lot on %s (Slave Ticket #%I64u, SL: %.5f, TP: %.5f)", side, slaveLot, localSym, slaveTicket, setSL, setTP);
      Print("[Slave] " + msg);
      g_lastStatusMessage = msg;
      AcknowledgeCommand(commandId, "done", msg);
      PostAccountState();
   }
   else
   {
      string err = StringFormat("Copy %s failed: Retcode %d / %s", side, m_trade.ResultRetcode(), m_trade.ResultRetcodeDescription());
      Print("[Slave] " + err);
      g_lastStatusMessage = err;
      AcknowledgeCommand(commandId, "failed", err);
   }
}

//+------------------------------------------------------------------+
//| SLAVE: EXECUTE COPY MODIFY (POINT-BASED SL/TP SYNC)              |
//+------------------------------------------------------------------+
void ExecuteSlaveCopyModify(string commandId, string payload)
{
   ulong masterTicket = (ulong)ExtractJsonDouble(payload, "master_ticket", 0);
   double newSl       = ExtractJsonDouble(payload, "sl", 0.0);
   double newTp       = ExtractJsonDouble(payload, "tp", 0.0);
   double slPoints    = ExtractJsonDouble(payload, "sl_points", 0.0);
   double tpPoints    = ExtractJsonDouble(payload, "tp_points", 0.0);
   double slDistance  = ExtractJsonDouble(payload, "sl_distance", 0.0);
   double tpDistance  = ExtractJsonDouble(payload, "tp_distance", 0.0);
   double masterPrice = ExtractJsonDouble(payload, "price", 0.0);

   ulong slaveTicket = FindSlaveTicket(masterTicket);

   if(slaveTicket == 0)
   {
      int total = PositionsTotal();
      for(int i = 0; i < total; i++)
      {
         if(m_position.SelectByIndex(i))
         {
            if(StringFind(m_position.Comment(), IntegerToString((long)masterTicket)) >= 0)
            {
               slaveTicket = m_position.Ticket();
               break;
            }
         }
      }
   }

   if(slaveTicket == 0)
   {
      AcknowledgeCommand(commandId, "failed", "No matching slave position for master ticket #" + IntegerToString((long)masterTicket));
      return;
   }

   if(m_position.SelectByTicket(slaveTicket))
   {
      string posSym = m_position.Symbol();
      double localPoint = SymbolInfoDouble(posSym, SYMBOL_POINT);
      if(localPoint <= 0) localPoint = _Point;
      int localDigits = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
      double stopLevel = (double)SymbolInfoInteger(posSym, SYMBOL_TRADE_STOPS_LEVEL) * localPoint;
      double freezeLevel = (double)SymbolInfoInteger(posSym, SYMBOL_TRADE_FREEZE_LEVEL) * localPoint;
      double minStopsDistance = MathMax(stopLevel, freezeLevel);

      double openPrice = m_position.PriceOpen();
      double currentBid = SymbolInfoDouble(posSym, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(posSym, SYMBOL_ASK);
      ENUM_POSITION_TYPE pType = m_position.PositionType();

      if(slDistance <= 0 && newSl > 0 && masterPrice > 0)
         slDistance = MathAbs(masterPrice - newSl);
      if(tpDistance <= 0 && newTp > 0 && masterPrice > 0)
         tpDistance = MathAbs(newTp - masterPrice);
      if(slPoints <= 0 && slDistance > 0 && localPoint > 0)
         slPoints = slDistance / localPoint;
      if(tpPoints <= 0 && tpDistance > 0 && localPoint > 0)
         tpPoints = tpDistance / localPoint;

      double setSl = m_position.StopLoss();
      double setTp = m_position.TakeProfit();

      if(InpCopyStopLoss)
      {
         if(slPoints > 0)
         {
            if(pType == POSITION_TYPE_BUY)
               setSl = NormalizeDouble(openPrice - (slPoints * localPoint), localDigits);
            else
               setSl = NormalizeDouble(openPrice + (slPoints * localPoint), localDigits);
         }
         else if(slDistance > 0)
         {
            if(pType == POSITION_TYPE_BUY)
               setSl = NormalizeDouble(openPrice - slDistance, localDigits);
            else
               setSl = NormalizeDouble(openPrice + slDistance, localDigits);
         }

         if(setSl > 0 && minStopsDistance > 0)
         {
            if(pType == POSITION_TYPE_BUY && (currentBid - setSl) < minStopsDistance)
               setSl = NormalizeDouble(currentBid - minStopsDistance, localDigits);
            else if(pType == POSITION_TYPE_SELL && (setSl - currentAsk) < minStopsDistance)
               setSl = NormalizeDouble(currentAsk + minStopsDistance, localDigits);
         }
      }

      if(InpCopyTakeProfit)
      {
         if(tpPoints > 0)
         {
            if(pType == POSITION_TYPE_BUY)
               setTp = NormalizeDouble(openPrice + (tpPoints * localPoint), localDigits);
            else
               setTp = NormalizeDouble(openPrice - (tpPoints * localPoint), localDigits);
         }
         else if(tpDistance > 0)
         {
            if(pType == POSITION_TYPE_BUY)
               setTp = NormalizeDouble(openPrice + tpDistance, localDigits);
            else
               setTp = NormalizeDouble(openPrice - tpDistance, localDigits);
         }

         if(setTp > 0 && minStopsDistance > 0)
         {
            if(pType == POSITION_TYPE_BUY && (setTp - currentBid) < minStopsDistance)
               setTp = NormalizeDouble(currentBid + minStopsDistance, localDigits);
            else if(pType == POSITION_TYPE_SELL && (currentAsk - setTp) < minStopsDistance)
               setTp = NormalizeDouble(currentAsk - minStopsDistance, localDigits);
         }
      }

      if(m_trade.PositionModify(slaveTicket, setSl, setTp))
      {
         string msg = StringFormat("Synced SL/TP for slave ticket #%I64u (SL: %.5f, TP: %.5f)", slaveTicket, setSl, setTp);
         Print("[Slave] " + msg);
         AcknowledgeCommand(commandId, "done", msg);
         PostAccountState();
      }
      else
      {
         AcknowledgeCommand(commandId, "failed", "PositionModify failed: " + IntegerToString((long)m_trade.ResultRetcode()));
      }
   }
   else
   {
      AcknowledgeCommand(commandId, "failed", "Could not select position #" + IntegerToString((long)slaveTicket));
   }
}

//+------------------------------------------------------------------+
//| SLAVE: EXECUTE COPY CLOSE                                        |
//+------------------------------------------------------------------+
void ExecuteSlaveCopyClose(string commandId, string payload)
{
   ulong masterTicket = (ulong)ExtractJsonDouble(payload, "master_ticket", 0);
   double closeVol    = ExtractJsonDouble(payload, "volume", 0.0);
   string reqSym      = ExtractJsonString(payload, "symbol");
   string side        = ExtractJsonString(payload, "side");

   ulong slaveTicket = ResolveCloseTicket(masterTicket, reqSym, side);

   if(slaveTicket == 0)
   {
      AcknowledgeCommand(commandId, "done", "Matching slave position already closed or not found");
      return;
   }

   if(m_position.SelectByTicket(slaveTicket))
   {
      bool success = false;
      if(closeVol > 0 && closeVol < m_position.Volume())
         success = m_trade.PositionClosePartial(slaveTicket, closeVol);
      else
         success = m_trade.PositionClose(slaveTicket);

      if(success)
      {
         RemoveTicketMapping(masterTicket);
         string msg = "Closed slave position #" + IntegerToString((long)slaveTicket);
         Print("[Slave] " + msg);
         AcknowledgeCommand(commandId, "done", msg);
         PostAccountState();
      }
      else
      {
         AcknowledgeCommand(commandId, "failed", "Close failed: " + IntegerToString((long)m_trade.ResultRetcode()));
      }
   }
   else
   {
      RemoveTicketMapping(masterTicket);
      AcknowledgeCommand(commandId, "done", "Position already closed");
   }
}

//+------------------------------------------------------------------+
//| DIRECT COMMAND HANDLERS (WEB DASHBOARD DIRECT ORDERS)             |
//+------------------------------------------------------------------+
bool IsTradeRequestSuccessful()
{
   uint retcode = m_trade.ResultRetcode();
   return retcode == TRADE_RETCODE_DONE ||
          retcode == TRADE_RETCODE_DONE_PARTIAL ||
          retcode == TRADE_RETCODE_PLACED;
}

string TradeRequestError(string operation)
{
   return StringFormat("%s failed: Retcode %d / %s", operation, m_trade.ResultRetcode(), m_trade.ResultRetcodeDescription());
}

void ExecuteDirectCloseAll(string commandId)
{
   int closed = 0;
   int failed = 0;
   int total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_trade.PositionClose(m_position.Ticket()) && IsTradeRequestSuccessful())
            closed++;
         else
            failed++;
      }
   }
   string msg = total == 0
      ? "No open positions to close"
      : StringFormat("Closed %d open position(s)%s", closed, failed > 0 ? StringFormat("; %d failed", failed) : "");
   Print("[Engine] " + msg);
   AcknowledgeCommand(commandId, failed > 0 ? "failed" : "done", msg);
   PostAccountState();
}

void ExecuteDirectBreakEven(string commandId, string payload = "")
{
   ulong ticket = (ulong)ExtractJsonDouble(payload, "ticket", 0);
   string reqSym = ExtractJsonString(payload, "symbol");
   string side = ExtractJsonString(payload, "side");
   ulong target = ResolveCloseTicket(ticket, reqSym, side);

   int modified = 0;
   if(target > 0 && m_position.SelectByTicket(target))
   {
      if(m_trade.PositionModify(target, m_position.PriceOpen(), m_position.TakeProfit()))
         modified++;
   }
   else if(ticket == 0 && side == "")
   {
      int total = PositionsTotal();
      for(int i = 0; i < total; i++)
      {
         if(m_position.SelectByIndex(i))
         {
            if(m_trade.PositionModify(m_position.Ticket(), m_position.PriceOpen(), m_position.TakeProfit()))
               modified++;
         }
      }
   }
   string msg = StringFormat("Break Even set on %d position(s)", modified);
   AcknowledgeCommand(commandId, "done", msg);
   PostAccountState();
}

void ExecuteDirectClose50(string commandId)
{
   int closed = 0;
   int failed = 0;
   int total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         double step = SymbolInfoDouble(m_position.Symbol(), SYMBOL_VOLUME_STEP);
         if(step <= 0) step = 0.01;
         double halfVol = MathFloor((m_position.Volume() / 2.0) / step) * step;
         halfVol = NormalizeDouble(halfVol, 8);
         if(halfVol >= SymbolInfoDouble(m_position.Symbol(), SYMBOL_VOLUME_MIN) &&
            m_trade.PositionClosePartial(m_position.Ticket(), halfVol) &&
            IsTradeRequestSuccessful())
         {
            closed++;
         }
         else
            failed++;
      }
   }
   string msg = total == 0
      ? "No open positions to partially close"
      : StringFormat("Closed 50%% on %d position(s)%s", closed, failed > 0 ? StringFormat("; %d failed or below minimum volume", failed) : "");
   AcknowledgeCommand(commandId, failed > 0 ? "failed" : "done", msg);
   PostAccountState();
}

void ExecuteDirectMarketOrder(string commandId, string action, string payload)
{
   string reqSym = ExtractJsonString(payload, "symbol");
   string sym = ResolveLocalSymbol(reqSym);
   if(sym == "" || !m_sym.Name(sym) || !m_sym.Select())
   {
      AcknowledgeCommand(commandId, "failed", "Cannot execute: missing or unmapped symbol " + reqSym);
      return;
   }

   double customLot = ExtractJsonDouble(payload, "volume", 0.0);
   if(customLot <= 0) customLot = ExtractJsonDouble(payload, "lot", InpFixedLotSize);

   double sl = ExtractJsonDouble(payload, "sl", 0.0);
   double tp = ExtractJsonDouble(payload, "tp", 0.0);
   double price = ExtractJsonDouble(payload, "price", 0.0);
   string orderTypeStr = ExtractJsonString(payload, "order_type");

   double lot = customLot;
   if(InpRole == ROLE_SLAVE && InpSlaveRiskMode == RISK_MULTIPLIER)
   {
      lot = CalculateSlaveLot(sym, customLot, sl, price, (action == "ARM_BUY" || action == "BUY" || action == "DIRECT_BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   }

   m_trade.SetDeviationInPoints(InpMaxSlippagePoints);
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   ApplySymbolFilling(sym);

   bool ok = false;
   string sideLabel = "BUY";

   if(action == "ARM_BUY" || action == "BUY" || action == "DIRECT_BUY")
   {
      sideLabel = "BUY";
      if(orderTypeStr == "BUY_LIMIT" && price > 0)
      {
         ok = m_trade.BuyLimit(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, "Web Dashboard BUY LIMIT");
      }
      else if(orderTypeStr == "BUY_STOP" && price > 0)
      {
         ok = m_trade.BuyStop(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, "Web Dashboard BUY STOP");
      }
      else
      {
         double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
         ok = m_trade.Buy(lot, sym, ask, sl, tp, "Web Dashboard BUY");
         if(!ok && (m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS || m_trade.ResultRetcode() == 10016))
         {
            ok = m_trade.Buy(lot, sym, ask, 0, 0, "Web Dashboard BUY");
            if(ok && (sl > 0 || tp > 0))
            {
               ulong pTgt = GetExecutedPositionTicket(0, sym);
               if(pTgt > 0) { Sleep(50); m_trade.PositionModify(pTgt, sl, tp); }
            }
         }
      }
   }
   else // SELL
   {
      sideLabel = "SELL";
      if(orderTypeStr == "SELL_LIMIT" && price > 0)
      {
         ok = m_trade.SellLimit(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, "Web Dashboard SELL LIMIT");
      }
      else if(orderTypeStr == "SELL_STOP" && price > 0)
      {
         ok = m_trade.SellStop(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, "Web Dashboard SELL STOP");
      }
      else
      {
         double bid = SymbolInfoDouble(sym, SYMBOL_BID);
         ok = m_trade.Sell(lot, sym, bid, sl, tp, "Web Dashboard SELL");
         if(!ok && (m_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS || m_trade.ResultRetcode() == 10016))
         {
            ok = m_trade.Sell(lot, sym, bid, 0, 0, "Web Dashboard SELL");
            if(ok && (sl > 0 || tp > 0))
            {
               ulong pTgt = GetExecutedPositionTicket(0, sym);
               if(pTgt > 0) { Sleep(50); m_trade.PositionModify(pTgt, sl, tp); }
            }
         }
      }
   }

   if(ok && IsTradeRequestSuccessful())
   {
      ulong resTicket = GetExecutedPositionTicket(0, sym);
      string msg = StringFormat("Executed %s %.2f lot on %s (Ticket #%I64u, SL: %.5f, TP: %.5f)",
                                sideLabel, lot, sym, resTicket, sl, tp);
      Print("[Engine] " + msg);
      AcknowledgeCommand(commandId, "done", msg);
      PostAccountState();
   }
   else
   {
      string err = TradeRequestError("Market Order");
      Print("[Engine] " + err);
      AcknowledgeCommand(commandId, "failed", err);
   }
}

void ExecuteDirectModifyPosition(string commandId, string payload)
{
   ulong ticket = (ulong)ExtractJsonDouble(payload, "ticket", 0);
   double sl    = ExtractJsonDouble(payload, "sl", 0.0);
   double tp    = ExtractJsonDouble(payload, "tp", 0.0);
   string reqSym = ExtractJsonString(payload, "symbol");
   string side   = ExtractJsonString(payload, "side");

   ticket = ResolveCloseTicket(ticket, reqSym, side);

   if(ticket > 0 && m_position.SelectByTicket(ticket))
   {
      if(m_trade.PositionModify(ticket, sl, tp) && IsTradeRequestSuccessful())
      {
         string msg = StringFormat("Modified position #%I64u (SL: %.5f, TP: %.5f)", ticket, sl, tp);
         Print("[Engine] " + msg);
         AcknowledgeCommand(commandId, "done", msg);
         PostAccountState();
      }
      else
      {
         string err = TradeRequestError("Modify Position");
         Print("[Engine] " + err);
         AcknowledgeCommand(commandId, "failed", err);
      }
   }
   else
   {
      AcknowledgeCommand(commandId, "failed", "Position not found for ticket #" + IntegerToString((long)ticket));
   }
}

ulong ResolveCloseTicket(ulong ticket, string reqSym, string side)
{
   if(ticket > 0 && m_position.SelectByTicket(ticket))
      return ticket;

   ulong mapped = FindSlaveTicket(ticket);
   if(mapped > 0 && m_position.SelectByTicket(mapped))
      return mapped;

   string needle = "Copy #" + IntegerToString((long)ticket);
   string localSym = ResolveLocalSymbol(reqSym);
   if(localSym == "") localSym = reqSym;
   StringToUpper(localSym);
   StringToUpper(side);

   ulong sideMatch = 0;
   int sideMatches = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      if(!m_position.SelectByIndex(i))
         continue;
      if(ticket > 0 && StringFind(m_position.Comment(), needle) >= 0)
         return m_position.Ticket();

      string posSym = m_position.Symbol();
      StringToUpper(posSym);
      if(localSym != "" && posSym != localSym)
         continue;
      string posSide = (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL");
      if(side != "" && posSide != side)
         continue;
      sideMatch = m_position.Ticket();
      sideMatches++;
   }

   if(side != "" && sideMatches >= 1)
      return sideMatch;
   return 0;
}

bool CloseResolvedTicket(ulong ticket, double volume)
{
   if(ticket == 0 || !m_position.SelectByTicket(ticket))
      return false;
   if(volume > 0 && volume < m_position.Volume())
      return m_trade.PositionClosePartial(ticket, volume) && IsTradeRequestSuccessful();
   return m_trade.PositionClose(ticket) && IsTradeRequestSuccessful();
}

void ExecuteDirectClosePosition(string commandId, string payload)
{
   ulong ticket = (ulong)ExtractJsonDouble(payload, "ticket", 0);
   double volume = ExtractJsonDouble(payload, "volume", 0.0);
   string reqSym = ExtractJsonString(payload, "symbol");
   string side = ExtractJsonString(payload, "side");

   ulong target = ResolveCloseTicket(ticket, reqSym, side);
   if(CloseResolvedTicket(target, volume))
   {
      AcknowledgeCommand(commandId, "done", "Closed matched position #" + IntegerToString((long)target));
      PostAccountState();
      return;
   }

   AcknowledgeCommand(commandId, "done", "Matching position already closed or not found");
}

//+------------------------------------------------------------------+
//| FAST COMMAND POLLING LOOP                                        |
//+------------------------------------------------------------------+
void HandlePolledCommand(string cmdId, string action, string response)
{
   PrintFormat("[Engine] Received Command '%s' (ID: %s)", action, cmdId);

   if(action == "COPY_OPEN")
   {
      ExecuteSlaveCopyOpen(cmdId, response);
   }
   else if(action == "COPY_MODIFY")
   {
      ExecuteSlaveCopyModify(cmdId, response);
   }
   else if(action == "COPY_CLOSE")
   {
      ExecuteSlaveCopyClose(cmdId, response);
   }
   else if(action == "CLOSE_ALL")
   {
      ExecuteDirectCloseAll(cmdId);
   }
   else if(action == "BREAK_EVEN")
   {
      ExecuteDirectBreakEven(cmdId, response);
   }
   else if(action == "CLOSE_50")
   {
      ExecuteDirectClose50(cmdId);
   }
   else if(action == "MODIFY_POSITION" || action == "MODIFY_SL_TP")
   {
      ExecuteDirectModifyPosition(cmdId, response);
   }
   else if(action == "CLOSE_POSITION" || action == "CLOSE_MARKET" || action == "PARTIAL_CLOSE")
   {
      ExecuteDirectClosePosition(cmdId, response);
   }
   else if(action == "BREAK_EVEN" || action == "FIRST_BREAK_EVEN")
   {
      ExecuteDirectBreakEven(cmdId, response);
   }
   else if(action == "BUY" || action == "SELL" || action == "DIRECT_BUY" || action == "DIRECT_SELL" || action == "ARM_BUY" || action == "ARM_SELL")
   {
      ExecuteDirectMarketOrder(cmdId, action, response);
   }
   else if(action == "PING")
   {
      AcknowledgeCommand(cmdId, "done", "PONG - EA Online and Ready");
      PostAccountState();
   }
   else if(action == "SET_RISK")
   {
      ApplyRemoteRiskSettings(response);
      AcknowledgeCommand(cmdId, "done", "Remote risk settings applied");
      PostAccountState();
   }
   else
   {
      AcknowledgeCommand(cmdId, "done", "Command " + action + " acknowledged");
   }
}

void PollNextCommand()
{
   string accountId = GetAccountId();
   string token = GetAccountToken();
   if(accountId == "" || token == "") return;

   string rpcBody = StringFormat(
      "{\"p_account_id\":\"%s\",\"p_token\":\"%s\"}",
      JsonEscape(accountId),
      JsonEscape(token)
   );

   for(int n = 0; n < 8; n++)
   {
      string response = HttpRpc("ea_next_command", rpcBody);
      if(response == "") return;
      if(!ExtractJsonBool(response, "has_command", false)) return;

      string cmdId  = ExtractJsonString(response, "id");
      string action = ExtractJsonString(response, "action");
      if(cmdId == "" || action == "") return;
      HandlePolledCommand(cmdId, action, response);
   }
}

//+------------------------------------------------------------------+
//| ON-CHART LIVE HUD DISPLAY                                        |
//+------------------------------------------------------------------+
void UpdateChartHUD()
{
   if(!InpShowChartHUD) return;

   string roleStr = (InpRole == ROLE_MASTER ? "👑 MASTER BROADCASTER" : "⚡ SLAVE COPIER");
   string key = GetAccountId();
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double openPl  = equity - balance;

   string hud = StringFormat(
      "======================================\n" +
      "  MT5 COPY ENGINE PRO [v2.60 ACCOUNT]\n" +
      "======================================\n" +
      "  Role: %s\n" +
      "  Connection Key: %s\n" +
      "  Cloud Status: %s\n" +
      "  Server: %s (%s)\n" +
      "  ------------------------------------\n" +
      "  Balance: $%.2f\n" +
      "  Equity:  $%.2f\n" +
      "  Open P/L: %s$%.2f\n" +
      "  Open Positions: %d (ALL symbols)\n" +
      "  Chart: %s (display only)\n" +
      "  ------------------------------------\n" +
      "  Last Event: %s\n" +
      "======================================",
      roleStr,
      key == "" ? "[MISSING - PASTE KEY FROM WEB]" : key,
      g_isOnline ? "ONLINE (CONNECTED)" : "WAITING / OFFLINE",
      AccountInfoString(ACCOUNT_SERVER),
      AccountInfoString(ACCOUNT_COMPANY),
      balance,
      equity,
      openPl >= 0 ? "+" : "",
      openPl,
      PositionsTotal(),
      _Symbol,
      g_lastStatusMessage
   );

   Comment(hud);
}

//+------------------------------------------------------------------+
//| EA LIFECYCLE HANDLERS                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[CopyEngine] Initializing MT5 Copy Engine Pro v2.60 (ONE chart -> ENTIRE ACCOUNT -> ALL SYMBOLS)...");

   g_remoteRiskMode = InpSlaveRiskMode;
   g_remoteLotMultiplier = InpLotMultiplier;
   g_remoteFixedLot = InpFixedLotSize;
   g_remoteRiskUsd = InpRiskUsdPerTrade;

   string key = GetCleanKey();
   int separator = StringFind(key, "|");
   if(key == "")
   {
      Print("[CopyEngine] CRITICAL: InpAccountKey is empty. Please paste the complete key from the Web Dashboard.");
   }
   else if(separator <= 0 || separator >= StringLen(key) - 1)
   {
      Print("[CopyEngine] CRITICAL: InpAccountKey must be pasted as ACCOUNT_UUID|SECRET_TOKEN. Open the dashboard and use Copy Key, or rotate the key.");
   }
   else
   {
      PrintFormat("[CopyEngine] Connection credentials loaded for account %s (secret length: %d).", GetAccountId(), StringLen(GetAccountToken()));
   }

   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpMaxSlippagePoints);

   EventSetMillisecondTimer(MathMax(50, InpPollIntervalMs));
   LoadTicketMap();

   if(InpRole == ROLE_MASTER)
      MasterScanPositionModifications();

   // Immediate state post
   PostAccountState();
   UpdateChartHUD();

   PrintFormat("[CopyEngine] Engine active. Role: %s. Poll Timer: %d ms.",
               InpRole == ROLE_MASTER ? "MASTER" : "SLAVE", InpPollIntervalMs);

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   PostAccountOfflineState();
   Comment("");
   Print("[CopyEngine] Deinitialized.");
}

void OnTimer()
{
   uint nowTick = GetTickCount();

   if(InpRole == ROLE_MASTER)
      FlushMasterCopyQueue();

   // 1. Fast Command Polling (every InpPollIntervalMs)
   if(nowTick - g_lastPollTick >= (uint)InpPollIntervalMs)
   {
      g_lastPollTick = nowTick;
      PollNextCommand();
   }

   // 2. Master SL/TP & Partial Close Modification Scanner
   if(InpRole == ROLE_MASTER)
   {
      MasterScanPositionModifications();
   }

   // 3. Telemetry State Heartbeat (every InpStateHeartbeatSec)
   if(nowTick - g_lastStateTick >= (uint)(InpStateHeartbeatSec * 1000))
   {
      g_lastStateTick = nowTick;
      PostAccountState();
      UpdateChartHUD();
   }
}

void OnTick()
{
   // Account-level copy must not depend on the attached chart ticking.
   // Fast path is OnTradeTransaction. Safety path is OnTimer.
}

//+------------------------------------------------------------------+
//| TRADE TRANSACTION INTERCEPTOR (INSTANT 0-MS MASTER BROADCAST)    |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(InpRole != ROLE_MASTER) return;

   // 1. Capture direct SL/TP dragging or modification on MT5 chart:
   if(trans.type == TRADE_TRANSACTION_POSITION)
   {
      ulong posTicket = trans.position;
      if(posTicket > 0 && m_position.SelectByTicket(posTicket))
      {
         ulong magic = m_position.Magic();
         string comment = m_position.Comment();
         if(ShouldCopyMasterTrade(magic, comment))
         {
            string sym = m_position.Symbol();
            EnsureSymbolWatch(sym);
            string side = (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL");
            double sl = m_position.StopLoss();
            double tp = m_position.TakeProfit();
            double priceOpen = m_position.PriceOpen();
            double vol = m_position.Volume();

            int knownIdx = FindKnownMasterIndex(posTicket);
            bool slChanged = (knownIdx < 0) || (MathAbs(g_knownMasterPositions[knownIdx].sl - sl) > 0.000001);
            bool tpChanged = (knownIdx < 0) || (MathAbs(g_knownMasterPositions[knownIdx].tp - tp) > 0.000001);

            if(slChanged || tpChanged)
            {
               MasterPositionSnapshot snap = CaptureOpenPosition();
               RememberMasterPosition(snap);
               MasterPublishEvent("MODIFY_SL_TP", posTicket, sym, side, vol, priceOpen, sl, tp);
            }
         }
      }
      return;
   }

   // 2. Deals added to history (Order filled, closed, or partially closed):
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD || (trans.type == TRADE_TRANSACTION_HISTORY_ADD && trans.deal > 0))
   {
      ulong dealTicket = trans.deal;
      if(dealTicket > 0)
      {
         // Ensure history window is loaded so HistoryDealSelect succeeds
         if(!HistoryDealSelect(dealTicket))
         {
            HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 86400);
            HistoryDealSelect(dealTicket);
         }

         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
         if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
         {
            if(trans.deal_type == DEAL_TYPE_BUY || trans.deal_type == DEAL_TYPE_SELL)
               dealType = trans.deal_type;
            else
               return;
         }

         ulong dealMagic = (ulong)HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
         string dealComment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
         if(!ShouldCopyMasterTrade(dealMagic, dealComment))
            return;

         string dealSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
         if(dealSymbol == "") dealSymbol = trans.symbol;
         if(dealSymbol == "") return;
         EnsureSymbolWatch(dealSymbol);

         ulong positionTicket = trans.position;
         if(positionTicket == 0)
            positionTicket = (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
         if(positionTicket == 0)
            positionTicket = dealTicket;

         double dealVolume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
         if(dealVolume <= 0) dealVolume = trans.volume;
         double dealPrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
         if(dealPrice <= 0) dealPrice = trans.price;

         if(entry == DEAL_ENTRY_IN || (entry == 0 && (dealType == DEAL_TYPE_BUY || dealType == DEAL_TYPE_SELL)))
         {
            string side = (dealType == DEAL_TYPE_BUY ? "BUY" : "SELL");
            double sl = 0.0;
            double tp = 0.0;
            if(m_position.SelectByTicket(positionTicket))
            {
               sl = m_position.StopLoss();
               tp = m_position.TakeProfit();
               MasterPositionSnapshot snap = CaptureOpenPosition();
               RememberMasterPosition(snap);
            }
            else if(trans.price_sl > 0 || trans.price_tp > 0)
            {
               sl = trans.price_sl;
               tp = trans.price_tp;
            }

            if(FindKnownMasterIndex(positionTicket) < 0)
            {
               MasterPositionSnapshot snap;
               snap.ticket = positionTicket;
               snap.volume = dealVolume;
               snap.sl = sl;
               snap.tp = tp;
               snap.priceOpen = dealPrice;
               snap.time = TimeCurrent();
               snap.symbol = dealSymbol;
               snap.type = (dealType == DEAL_TYPE_BUY ? POSITION_TYPE_BUY : POSITION_TYPE_SELL);
               RememberMasterPosition(snap);
            }

            if(StringFind(dealComment, "Web Dashboard") < 0)
            {
               MasterPublishEvent("OPEN_MARKET", positionTicket, dealSymbol, side, dealVolume, dealPrice, sl, tp, dealTicket);
            }
         }
         else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
         {
            string side = "BUY";
            int knownIdx = FindKnownMasterIndex(positionTicket);
            if(knownIdx >= 0)
               side = (g_knownMasterPositions[knownIdx].type == POSITION_TYPE_BUY ? "BUY" : "SELL");
            else if(m_position.SelectByTicket(positionTicket))
               side = (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL");
            else if(dealType == DEAL_TYPE_BUY)
               side = "SELL";
            else if(dealType == DEAL_TYPE_SELL)
               side = "BUY";

            if(m_position.SelectByTicket(positionTicket))
            {
               MasterPositionSnapshot snap = CaptureOpenPosition();
               MasterPublishEvent("PARTIAL_CLOSE", positionTicket, dealSymbol, side, dealVolume, dealPrice, snap.sl, snap.tp, dealTicket, snap.volume);
               RememberMasterPosition(snap);
            }
            else
            {
               MasterPublishEvent("CLOSE_MARKET", positionTicket, dealSymbol, side, dealVolume, dealPrice, 0, 0, dealTicket);
               ForgetMasterPosition(positionTicket);
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
