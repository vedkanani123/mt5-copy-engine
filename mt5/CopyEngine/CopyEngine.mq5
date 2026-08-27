#property strict
#property version "1.0.0"
#include <Trade/Trade.mqh>

enum EA_MODE { MASTER=0, SLAVE=1 };
input EA_MODE Mode=MASTER;
input string SupabaseUrl="https://your-project.supabase.co";
input string SupabasePublishableKey="";
input string PairingKey="";
input string DeviceToken="";
input string DeviceName="MT5 Copy Engine";
input int HeartbeatInterval=5;
input bool AutoCopy=true;
input bool DryRun=true;
input bool DebugLogging=false;

CTrade trade; string token; string device_id; ulong event_count=0; datetime last_heartbeat=0;

string JsonEscape(string value){StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");return value;}
string Http(string rpc_name,string body){
  char data[],result[]; string headers="Content-Type: application/json\r\n"+"apikey: "+SupabasePublishableKey+"\r\n"; StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8);
  ResetLastError(); int code=WebRequest("POST",SupabaseUrl+"/rest/v1/rpc/"+rpc_name,headers,10000,data,result,headers);
  if(code<200||code>=300){if(DebugLogging)PrintFormat("Copy Engine HTTP %s failed: %d / %d",function_name,code,GetLastError());return "";}
  return CharArrayToString(result,0,-1,CP_UTF8);
}
bool Provision(){
  string body=StringFormat("{\"pairing_key\":\"%s\",\"account_number\":\"%I64u\",\"broker\":\"%s\",\"server\":\"%s\",\"mode\":\"%s\",\"device_name\":\"%s\",\"ea_version\":\"1.0.0\"}",JsonEscape(PairingKey),(long)AccountInfoInteger(ACCOUNT_LOGIN),JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),JsonEscape(AccountInfoString(ACCOUNT_SERVER)),Mode==MASTER?"MASTER":"SLAVE",JsonEscape(DeviceName));
  string response=Http("register_ea_device",StringFormat("{\"p_pairing_key\":\"%s\",\"p_account_number\":\"%I64u\",\"p_broker\":\"%s\",\"p_server\":\"%s\",\"p_mode\":\"%s\",\"p_device_name\":\"%s\",\"p_ea_version\":\"1.0.0\"}",JsonEscape(PairingKey),(long)AccountInfoInteger(ACCOUNT_LOGIN),JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),JsonEscape(AccountInfoString(ACCOUNT_SERVER)),Mode==MASTER?"MASTER":"SLAVE",JsonEscape(DeviceName))); if(response=="")return false;
  int p=StringFind(response,"\"device_token\":\""); if(p<0)return false; p+=16; int end=StringFind(response,"\"",p); token=StringSubstr(response,p,end-p); p=StringFind(response,"\"device_id\":\""); if(p>=0){p+=13;end=StringFind(response,"\"",p);device_id=StringSubstr(response,p,end-p);} return token!="";
}
void Heartbeat(){ if(token=="")return; string body=StringFormat("{\"p_device_token\":\"%s\",\"p_balance\":%.2f,\"p_equity\":%.2f,\"p_free_margin\":%.2f,\"p_open_positions\":%d,\"p_terminal_connected\":true,\"p_trade_allowed\":%s,\"p_ea_version\":\"1.0.0\"}",token,AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY),AccountInfoDouble(ACCOUNT_MARGIN_FREE),PositionsTotal(),(bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)?"true":"false"); Http("record_ea_heartbeat",body); }
void Publish(const MqlTradeTransaction &trans){ if(token==""||Mode!=MASTER)return; string event_id="evt_"+IntegerToString((long)GetMicrosecondCount()); string event=StringFormat("{\"event_id\":\"%s\",\"master_position_id\":\"%I64u\",\"action\":\"OPEN_MARKET\",\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,\"price\":%.5f,\"sequence\":%I64u,\"timestamp\":%I64d}",event_id,(long)trans.position,JsonEscape(trans.symbol),trans.deal_type==DEAL_TYPE_BUY?"BUY":"SELL",trans.volume,trans.price,event_count,(long)TimeCurrent()); string body=StringFormat("{\"p_device_token\":\"%s\",\"p_event\":%s}",token,event); if(Http("publish_master_event",body)!="")event_count++; }
int OnInit(){ if(!TerminalInfoInteger(TERMINAL_CONNECTED))return INIT_FAILED; if(Mode==MASTER&&PairingKey=="")return INIT_PARAMETERS_INCORRECT; if(Mode==SLAVE&&PairingKey==""&&DeviceToken=="")return INIT_PARAMETERS_INCORRECT; if(DeviceToken!="")token=DeviceToken; if(token==""&&!Provision())return INIT_FAILED; EventSetTimer(MathMax(1,HeartbeatInterval)); return INIT_SUCCEEDED; }
void OnDeinit(const int reason){EventKillTimer(); token="";}
void OnTimer(){if(TimeCurrent()-last_heartbeat>=HeartbeatInterval){Heartbeat();last_heartbeat=TimeCurrent();}}
void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){if(Mode==MASTER&&trans.type==TRADE_TRANSACTION_DEAL_ADD)Publish(trans);}
