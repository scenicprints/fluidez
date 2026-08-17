import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_tts/flutter_tts.dart';

// Network helper (so the content service can call httpGet(...))
// Sends no-cache headers so we always get fresh content from GitHub/CDN,
// never a stale cached copy held by the OS or an intermediate cache.
Future<http.Response> httpGet(Uri url) => http.get(url, headers: const {
      'Cache-Control': 'no-cache, no-store, max-age=0',
      'Pragma': 'no-cache',
    });

// ── AUDIO (text-to-speech) ──
class Speech {
  static final FlutterTts _tts = FlutterTts();
  static bool _ready = false;
  static Future<void> _init() async {
    if (_ready) return;
    try {
      await _tts.setLanguage(
          "es-MX"); // closest widely-available Latin American Spanish
      await _tts.setSpeechRate(0.45); // a touch slower for learners
      await _tts.setPitch(1.0);
      _ready = true;
    } catch (_) {}
  }

  static Future<void> speak(String text) async {
    await _init();
    try {
      await _tts.stop();
      await _tts.speak(text);
    } catch (_) {}
  }

  static Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }
}

void main() => runApp(const FluidezApp());

// ── DESIGN TOKENS ──
class T {
  static const bg = Color(0xFF0F1117);
  static const sf = Color(0xFF1A1C25);
  static const sf2 = Color(0xFF242733);
  static const sf3 = Color(0xFF2E3142);
  static const rd = Color(0xFFFAF5ED);
  static const rt = Color(0xFF2C2416);
  static const rm = Color(0xFF8A7E6D);
  static const gold = Color(0xFFE4A53A);
  static const teal = Color(0xFF3DB89A);
  static const coral = Color(0xFFE07A5F);
  static const indigo = Color(0xFF6C7BDA);
  static const txt = Color(0xFFE8E6E1);
  static const tm = Color(0xFF9A978F);
  static const dim = Color(0xFF5C5950);
  static const w = Color(0xFFFFFFFF);
  static Color gd = const Color(0xFFE4A53A).withOpacity(0.15);
  static Color td = const Color(0xFF3DB89A).withOpacity(0.12);
  static Color cd = const Color(0xFFE07A5F).withOpacity(0.12);
  static Color idc = const Color(0xFF6C7BDA).withOpacity(0.12);
}

// ── DATA CLASSES ──
class E {
  final String en, pos;
  final String? g, note;
  const E(this.en, this.pos, this.g, this.note);
}

class Sn {
  final String s, e;
  const Sn(this.s, this.e);
}

class Story {
  final String id, title, desc;
  final int ph, diff;
  final List<String> wu;
  final List<Sn> sn;
  const Story(
      {required this.id,
      required this.title,
      required this.desc,
      required this.ph,
      required this.diff,
      required this.wu,
      required this.sn});
}

class Pattern {
  final String id, title, text;
  final int min;
  final List<String> trigger;
  const Pattern(
      {required this.id,
      required this.title,
      required this.text,
      required this.min,
      required this.trigger});
}

// ── SCENARIO MODEL ──
// A scenario is a scripted conversation. Each step: the other person says a
// line (Spanish + English), then the user picks a reply from options. Each
// option is right/ok/wrong with feedback. The conversation flows linearly
// through the steps.
class ScenarioOption {
  final String es, en, feedback;
  final String verdict; // "good" | "ok" | "bad"
  const ScenarioOption(
      {required this.es,
      required this.en,
      required this.feedback,
      required this.verdict});
}

class ScenarioStep {
  final String speaker; // who's talking (e.g., "Doña Carmen")
  final String promptEs; // what they say (Spanish)
  final String promptEn; // English translation
  final List<ScenarioOption> options;
  const ScenarioStep(
      {required this.speaker,
      required this.promptEs,
      required this.promptEn,
      required this.options});
}

class Scenario {
  final String id, title, desc, setting;
  final int ph;
  final List<ScenarioStep> steps;
  const Scenario(
      {required this.id,
      required this.title,
      required this.desc,
      required this.setting,
      required this.ph,
      required this.steps});
}

// ── DICTIONARY (559 entries) ──
const Map<String, E> bundledD = {
  "dale": E(
      "go ahead/okay", "intj", null, "Very Nicaraguan. 'Dale pues'=okay then"),
  "ideay": E("so?/well?/what?", "intj", null,
      "Uniquely Nica. From '¿Y de ahí?' Surprise/curiosity"),
  "tuani":
      E("cool/awesome", "adj", null, "Nica slang. '¡Qué tuani!'=How cool!"),
  "chele": E("foreigner/light-skinned", "n", "m/f",
      "Nica slang. Not offensive. Fem: chela"),
  "chavalo": E("kid/young person", "n", "m", "Nica for muchacho. Fem: chavala"),
  "chavalos": E("kids", "n", "m", null),
  "chavala": E("girl/young woman", "n", "f", null),
  "pinolero":
      E("Nicaraguan", "n", "m", "From pinol (corn drink). Term of pride"),
  "fritanga": E("street food stand", "n", "f", "Heart of Nica food culture"),
  "nica": E("Nicaraguan", "adj", null, "Casual way to say Nicaraguan"),
  "plata": E("money/silver", "n", "f", "Informal for money"),
  "reales": E("money (slang)", "n", "m", "Old currency name, still used"),
  "pues":
      E("well/so/then", "conj", null, "Constant filler. Dale pues=okay then"),
  "pulpería": E("corner shop", "n", "f", "Small neighborhood store"),
  "barrio": E("neighborhood", "n", "m", null),
  "cuadra": E("block (street)", "n", "f", "Distances given in cuadras in Nica"),
  "cuadras": E("blocks", "n", "f", null),
  "nacatamal": E("nacatamal", "n", "m", "Nica tamale wrapped in banana leaf"),
  "nacatamales": E("nacatamales", "n", "m", null),
  "vigorón": E("vigorón", "n", "m", "Yuca+chicharrón+cabbage salad"),
  "tajadas": E("plantain slices", "n", "f", "Fried green or ripe plantain"),
  "córdoba": E("córdoba (currency)", "n", "m", "Nica currency"),
  "córdobas": E("córdobas", "n", "m", null),
  "vos": E("you (informal)", "pron", null,
      "Nica uses vos not tú. Changes conjugations"),
  "sos": E("you are (vos)", "v", null, "Vos sos = Tú eres"),
  "tenés": E("you have (vos)", "v", null, "Vos tenés = Tú tienes"),
  "querés": E("you want (vos)", "v", null, null),
  "sabés": E("you know (vos)", "v", null, null),
  "podés": E("you can (vos)", "v", null, null),
  "venís": E("you come (vos)", "v", null, null),
  "hacés": E("you do/make (vos)", "v", null, null),
  "decís": E("you say (vos)", "v", null, null),
  "mirá": E("look/hey (vos cmd)", "v", null, "Common opener: 'Mirá, ...'"),
  "andá": E("go (vos cmd)", "v", null, null),
  "decime": E("tell me (vos cmd)", "v", null, null),
  "tomá": E("take/here (vos cmd)", "v", null, null),
  "pasá": E("pass/come (vos cmd)", "v", null, null),
  "esperá": E("wait (vos cmd)", "v", null, null),
  "sentate": E("sit down (vos cmd)", "v", null, null),
  "comé": E("eat (vos cmd)", "v", null, null),
  "vení": E("come (vos cmd)", "v", null, null),
  "yo": E("I/me", "pron", null, null),
  "él": E("he/him", "pron", null, null),
  "ella": E("she/her", "pron", null, null),
  "nosotros": E("we/us", "pron", null, null),
  "ellos": E("they/them", "pron", null, null),
  "ellas": E("they/them (f)", "pron", null, null),
  "me": E("me/myself", "pron", null, null),
  "te": E("you/yourself", "pron", null, null),
  "se": E("himself/herself", "pron", null, null),
  "le": E("to him/her", "pron", null, null),
  "les": E("to them", "pron", null, null),
  "lo": E("him/it", "pron", "m", null),
  "la": E("the", "art", "f", null),
  "los": E("the (pl)", "art", "m", null),
  "las": E("the (pl)", "art", "f", null),
  "nos": E("us/ourselves", "pron", null, null),
  "mi": E("my", "adj", null, null),
  "mis": E("my (pl)", "adj", null, null),
  "tu": E("your", "adj", null, null),
  "tus": E("your (pl)", "adj", null, null),
  "su": E("his/her/your/their", "adj", null, null),
  "sus": E("their (pl)", "adj", null, null),
  "nuestro": E("our", "adj", "m", null),
  "nuestra": E("our (f)", "adj", "f", null),
  "el": E("the", "art", "m", null),
  "un": E("a/one", "art", "m", null),
  "una": E("a/one", "art", "f", null),
  "unos": E("some", "art", "m", null),
  "unas": E("some", "art", "f", null),
  "ser": E("to be (permanent)", "v", null, "Identity/origin/profession"),
  "soy": E("I am", "v", null, null),
  "es": E("is", "v", null, null),
  "son": E("are (they)", "v", null, null),
  "somos": E("we are", "v", null, null),
  "era": E("was (ser)", "v", null, null),
  "fue": E("was/went", "v", null, null),
  "estar": E("to be (temp/location)", "v", null, "Mood/state/location"),
  "estoy": E("I am (state)", "v", null, null),
  "está": E("is (state)", "v", null, null),
  "están": E("are (state)", "v", null, null),
  "estás": E("you are (state)", "v", null, null),
  "estamos": E("we are (state)", "v", null, null),
  "tener": E("to have", "v", null, "Also: age (tengo 25 años)"),
  "tengo": E("I have", "v", null, null),
  "tiene": E("has", "v", null, null),
  "tienen": E("they have", "v", null, null),
  "tenemos": E("we have", "v", null, null),
  "tuve": E("I had", "v", null, null),
  "hacer": E("to do/make", "v", null, null),
  "hago": E("I do/make", "v", null, null),
  "hace": E("does/makes/ago", "v", null, "'Hace 2 días'=2 days ago"),
  "hacemos": E("we do/make", "v", null, null),
  "hice": E("I did/made", "v", null, null),
  "ir": E("to go", "v", null, "Irregular: voy,vas,va,vamos,van"),
  "voy": E("I go", "v", null, null),
  "va": E("goes", "v", null, null),
  "vamos": E("we go/let's go", "v", null, null),
  "van": E("they go", "v", null, null),
  "fui": E("I went", "v", null, null),
  "poder": E("to be able/can", "v", null, null),
  "puedo": E("I can", "v", null, null),
  "puede": E("can (he/she)", "v", null, null),
  "pueden": E("they can", "v", null, null),
  "podemos": E("we can", "v", null, null),
  "querer": E("to want/to love", "v", null, null),
  "quiero": E("I want", "v", null, null),
  "quiere": E("wants", "v", null, null),
  "queremos": E("we want", "v", null, null),
  "decir": E("to say/tell", "v", null, null),
  "digo": E("I say", "v", null, null),
  "dice": E("says", "v", null, null),
  "dicen": E("they say", "v", null, null),
  "dije": E("I said", "v", null, null),
  "dar": E("to give", "v", null, null),
  "doy": E("I give", "v", null, null),
  "da": E("gives", "v", null, null),
  "dan": E("they give", "v", null, null),
  "di": E("I gave", "v", null, null),
  "saber":
      E("to know (facts)", "v", null, "Facts/skills. Conocer=people/places"),
  "sé": E("I know", "v", null, null),
  "sabe": E("knows", "v", null, null),
  "sabemos": E("we know", "v", null, null),
  "conocer": E("to know (person/place)", "v", null, null),
  "conozco": E("I know (someone)", "v", null, null),
  "conocen": E("they know", "v", null, null),
  "ver": E("to see", "v", null, null),
  "veo": E("I see", "v", null, null),
  "ve": E("sees", "v", null, null),
  "vi": E("I saw", "v", null, null),
  "hablar": E("to speak/talk", "v", null, null),
  "hablo": E("I speak", "v", null, null),
  "habla": E("speaks", "v", null, null),
  "hablamos": E("we speak", "v", null, null),
  "hablé": E("I spoke", "v", null, null),
  "comer": E("to eat", "v", null, null),
  "como": E("like/as", "conj", null, null),
  "come": E("eats", "v", null, null),
  "comemos": E("we eat", "v", null, null),
  "comí": E("I ate", "v", null, null),
  "vivir": E("to live", "v", null, null),
  "vivo": E("I live", "v", null, null),
  "vive": E("lives", "v", null, null),
  "vivimos": E("we live", "v", null, null),
  "viví": E("I lived", "v", null, null),
  "llegar": E("to arrive", "v", null, null),
  "llego": E("I arrive", "v", null, null),
  "llega": E("arrives", "v", null, null),
  "llegué": E("I arrived", "v", null, null),
  "salir": E("to leave/go out", "v", null, null),
  "salgo": E("I leave", "v", null, null),
  "sale": E("leaves", "v", null, null),
  "venir": E("to come", "v", null, null),
  "vengo": E("I come", "v", null, null),
  "viene": E("comes", "v", null, null),
  "vienen": E("they come", "v", null, null),
  "vine": E("I came", "v", null, null),
  "tomar": E("to take/drink", "v", null, "In Nica: to drink"),
  "tomo": E("I take/drink", "v", null, null),
  "comprar": E("to buy", "v", null, null),
  "compro": E("I buy", "v", null, null),
  "vender": E("to sell", "v", null, null),
  "venden": E("they sell", "v", null, null),
  "pagar": E("to pay", "v", null, null),
  "pago": E("I pay", "v", null, null),
  "buscar": E("to look for", "v", null, null),
  "busco": E("I look for", "v", null, null),
  "encontrar": E("to find", "v", null, null),
  "encuentro": E("I find", "v", null, null),
  "encuentra": E("finds", "v", null, null),
  "necesitar": E("to need", "v", null, null),
  "necesito": E("I need", "v", null, null),
  "trabajar": E("to work", "v", null, null),
  "trabajo": E("work/job", "n", "m", null),
  "estudiar": E("to study", "v", null, null),
  "aprender": E("to learn", "v", null, null),
  "enseñar": E("to teach", "v", null, null),
  "entender": E("to understand", "v", null, null),
  "entiendo": E("I understand", "v", null, null),
  "entiende": E("understands", "v", null, null),
  "entendés": E("you understand (vos)", "v", null, null),
  "pensar": E("to think", "v", null, null),
  "pienso": E("I think", "v", null, null),
  "creer": E("to believe/think", "v", null, null),
  "creo": E("I believe/think", "v", null, null),
  "sentir": E("to feel", "v", null, null),
  "siento": E("I feel", "v", null, null),
  "llamar": E("to call", "v", null, null),
  "llamo": E("I call", "v", null, null),
  "llama": E("calls/is named", "v", null, null),
  "esperar": E("to wait/hope", "v", null, null),
  "ayudar": E("to help", "v", null, null),
  "ayuda": E("help/helps", "v/n", "f", null),
  "preguntar": E("to ask", "v", null, null),
  "pregunta": E("question", "n", "f", null),
  "responder": E("to answer", "v", null, null),
  "explicar": E("to explain", "v", null, null),
  "dormir": E("to sleep", "v", null, null),
  "duermo": E("I sleep", "v", null, null),
  "descansar": E("to rest", "v", null, null),
  "caminar": E("to walk", "v", null, null),
  "correr": E("to run", "v", null, null),
  "jugar": E("to play", "v", null, null),
  "leer": E("to read", "v", null, null),
  "escribir": E("to write", "v", null, null),
  "abrir": E("to open", "v", null, null),
  "cerrar": E("to close", "v", null, null),
  "poner": E("to put", "v", null, null),
  "pongo": E("I put", "v", null, null),
  "traer": E("to bring", "v", null, null),
  "trae": E("brings", "v", null, null),
  "llevar": E("to carry/wear", "v", null, null),
  "dejar": E("to leave/let", "v", null, null),
  "pasar": E("to pass/happen", "v", null, null),
  "pasa": E("happens/passes", "v", null, null),
  "quedar": E("to stay/remain", "v", null, null),
  "gustar":
      E("to like (please)", "v", null, "Me gusta = I like (it pleases me)"),
  "gusta": E("pleases", "v", null, null),
  "gustan": E("please (pl)", "v", null, null),
  "parecer": E("to seem", "v", null, null),
  "parece": E("seems", "v", null, "¿Qué te parece? = What do you think?"),
  "cambiar": E("to change", "v", null, null),
  "empezar": E("to begin/start", "v", null, null),
  "terminar": E("to finish", "v", null, null),
  "tratar": E("to try/treat", "v", null, null),
  "usar": E("to use", "v", null, null),
  "perder": E("to lose", "v", null, null),
  "ganar": E("to win/earn", "v", null, null),
  "recibir": E("to receive", "v", null, null),
  "mandar": E("to send", "v", null, null),
  "pedir": E("to ask for/order", "v", null, null),
  "pido": E("I ask for/order", "v", null, null),
  "seguir": E("to follow/continue", "v", null, null),
  "sigo": E("I follow", "v", null, null),
  "morir": E("to die", "v", null, null),
  "nacer": E("to be born", "v", null, null),
  "hombre": E("man", "n", "m", null),
  "mujer": E("woman", "n", "f", null),
  "niño": E("child/boy", "n", "m", null),
  "niña": E("girl", "n", "f", null),
  "niños": E("children", "n", "m", null),
  "persona": E("person", "n", "f", null),
  "personas": E("people", "n", "f", null),
  "gente": E("people", "n", "f", "Always singular: la gente es..."),
  "amigo": E("friend", "n", "m", null),
  "amiga": E("friend (f)", "n", "f", null),
  "amigos": E("friends", "n", "m", null),
  "familia": E("family", "n", "f", null),
  "padre": E("father", "n", "m", null),
  "madre": E("mother", "n", "f", null),
  "hijo": E("son", "n", "m", null),
  "hija": E("daughter", "n", "f", null),
  "hermano": E("brother/bro", "n", "m", "Also casual 'bro' in Nica"),
  "hermana": E("sister", "n", "f", null),
  "esposo": E("husband", "n", "m", null),
  "esposa": E("wife", "n", "f", null),
  "abuelo": E("grandfather", "n", "m", null),
  "abuela": E("grandmother", "n", "f", null),
  "tío": E("uncle", "n", "m", null),
  "tía": E("aunt", "n", "f", null),
  "primo": E("cousin", "n", "m", null),
  "prima": E("cousin (f)", "n", "f", null),
  "nombre": E("name", "n", "m", null),
  "casa": E("house/home", "n", "f", null),
  "calle": E("street", "n", "f", null),
  "calles": E("streets", "n", "f", null),
  "ciudad": E("city", "n", "f", null),
  "país": E("country", "n", "m", null),
  "lugar": E("place", "n", "m", null),
  "mundo": E("world", "n", "m", null),
  "tierra": E("earth/land", "n", "f", null),
  "agua": E("water", "n", "f", null),
  "comida": E("food/meal", "n", "f", null),
  "carne": E("meat", "n", "f", null),
  "pollo": E("chicken", "n", "m", null),
  "pescado": E("fish (food)", "n", "m", null),
  "arroz": E("rice", "n", "m", null),
  "frijoles": E("beans", "n", "m", null),
  "queso": E("cheese", "n", "m", null),
  "pan": E("bread", "n", "m", null),
  "leche": E("milk", "n", "f", null),
  "café": E("coffee", "n", "m", null),
  "cerveza": E("beer", "n", "f", null),
  "fruta": E("fruit", "n", "f", null),
  "verdura": E("vegetable", "n", "f", null),
  "plato": E("plate/dish", "n", "m", null),
  "vaso": E("glass/cup", "n", "m", null),
  "mesa": E("table", "n", "f", null),
  "silla": E("chair", "n", "f", null),
  "cama": E("bed", "n", "f", null),
  "puerta": E("door", "n", "f", null),
  "ventana": E("window", "n", "f", null),
  "cuarto": E("room", "n", "m", null),
  "baño": E("bathroom", "n", "m", null),
  "cocina": E("kitchen", "n", "f", null),
  "tienda": E("store/shop", "n", "f", null),
  "mercado": E("market", "n", "m", null),
  "escuela": E("school", "n", "f", null),
  "iglesia": E("church", "n", "f", null),
  "hospital": E("hospital", "n", "m", null),
  "farmacia": E("pharmacy", "n", "f", null),
  "banco": E("bank/bench", "n", "m", null),
  "dinero": E("money", "n", "m", null),
  "precio": E("price", "n", "m", null),
  "precios": E("prices", "n", "m", null),
  "bolsa": E("bag", "n", "f", null),
  "ropa": E("clothing", "n", "f", null),
  "zapatos": E("shoes", "n", "m", null),
  "camisa": E("shirt", "n", "f", null),
  "teléfono": E("phone", "n", "m", null),
  "carro": E("car", "n", "m", null),
  "bus": E("bus", "n", "m", null),
  "taxi": E("taxi", "n", "m", null),
  "chofer": E("driver", "n", "m", null),
  "problema": E("problem", "n", "m", "Masculine despite -a ending"),
  "cosa": E("thing", "n", "f", null),
  "parte": E("part", "n", "f", null),
  "lado": E("side", "n", "m", null),
  "forma": E("way/form", "n", "f", null),
  "vida": E("life", "n", "f", null),
  "tiempo": E("time/weather", "n", "m", null),
  "hora": E("hour/time", "n", "f", null),
  "día": E("day", "n", "m", "Masculine despite -a ending"),
  "días": E("days", "n", "m", null),
  "noche": E("night", "n", "f", null),
  "mañana": E("tomorrow", "adv", null, null),
  "tarde": E("afternoon/late", "n/adj", "f", null),
  "semana": E("week", "n", "f", null),
  "mes": E("month", "n", "m", null),
  "año": E("year", "n", "m", null),
  "años": E("years", "n", "m", null),
  "vez": E("time (occurrence)", "n", "f", "Otra vez=again"),
  "veces": E("times", "n", "f", null),
  "libro": E("book", "n", "m", null),
  "palabra": E("word", "n", "f", null),
  "historia": E("story/history", "n", "f", null),
  "respuesta": E("answer", "n", "f", null),
  "idea": E("idea", "n", "f", null),
  "razón": E("reason", "n", "f", "Tiene razón=is right"),
  "verdad": E("truth", "n", "f", "¿Verdad?=right?"),
  "lengua": E("language/tongue", "n", "f", null),
  "español": E("Spanish", "n", "m", null),
  "inglés": E("English", "n", "m", null),
  "cabeza": E("head", "n", "f", null),
  "mano": E("hand", "n", "f", "Feminine despite -o ending"),
  "ojo": E("eye", "n", "m", null),
  "ojos": E("eyes", "n", "m", null),
  "boca": E("mouth", "n", "f", null),
  "cuerpo": E("body", "n", "m", null),
  "estómago": E("stomach", "n", "m", null),
  "corazón": E("heart", "n", "m", null),
  "dolor": E("pain", "n", "m", "Tengo dolor de...=I have a pain in..."),
  "fiebre": E("fever", "n", "f", null),
  "medicina": E("medicine", "n", "f", null),
  "pastilla": E("pill", "n", "f", null),
  "pastillas": E("pills", "n", "f", null),
  "médico": E("doctor", "n", "m", null),
  "sol": E("sun", "n", "m", null),
  "lluvia": E("rain", "n", "f", null),
  "lago": E("lake", "n", "m", null),
  "montaña": E("mountain", "n", "f", null),
  "playa": E("beach", "n", "f", null),
  "mar": E("sea", "n", "m", null),
  "río": E("river", "n", "m", null),
  "árbol": E("tree", "n", "m", null),
  "perro": E("dog", "n", "m", null),
  "gato": E("cat", "n", "m", null),
  "gallo": E("rooster", "n", "m", null),
  "pinto": E("painted/spotted", "adj", "m", null),
  "comedor": E("dining area", "n", "m", null),
  "cobrador": E("fare collector", "n", "m", null),
  "parada": E("bus stop", "n", "f", null),
  "esquina": E("corner", "n", "f", null),
  "gusto": E("pleasure", "n", "m", "Mucho gusto=nice to meet you"),
  "sabor": E("flavor", "n", "m", null),
  "sonrisa": E("smile", "n", "f", null),
  "ruido": E("noise", "n", "m", null),
  "música": E("music", "n", "f", null),
  "fiesta": E("party", "n", "f", null),
  "juego": E("game", "n", "m", null),
  "doña": E("Doña (title)", "n", "f", "Respectful title for older women"),
  "don": E("Don (title)", "n", "m", "Respectful title for older men"),
  "señora": E("ma'am/Mrs.", "n", "f", null),
  "señor": E("sir/Mr.", "n", "m", null),
  "bueno": E("good", "adj", "m", null),
  "buena": E("good (f)", "adj", "f", null),
  "buenos": E("good (pl)", "adj", "m", null),
  "malo": E("bad", "adj", "m", null),
  "mala": E("bad (f)", "adj", "f", null),
  "grande": E("big/large", "adj", null, null),
  "gran": E("great/big", "adj", null, null),
  "pequeño": E("small", "adj", "m", null),
  "nuevo": E("new", "adj", "m", null),
  "nueva": E("new (f)", "adj", "f", null),
  "viejo": E("old", "adj", "m", null),
  "vieja": E("old (f)", "adj", "f", null),
  "joven": E("young", "adj", null, null),
  "bonito": E("pretty/nice", "adj", "m", null),
  "bonita": E("pretty (f)", "adj", "f", null),
  "feo": E("ugly", "adj", "m", null),
  "largo": E("long", "adj", "m", null),
  "corto": E("short (length)", "adj", "m", null),
  "alto": E("tall/high", "adj", "m", null),
  "bajo": E("short/low", "adj", "m", null),
  "gordo": E("fat", "adj", "m", null),
  "flaco": E("thin/skinny", "adj", "m", null),
  "fuerte": E("strong", "adj", null, null),
  "débil": E("weak", "adj", null, null),
  "rápido": E("quickly", "adv", null, null),
  "lento": E("slow", "adj", null, null),
  "caliente": E("hot", "adj", null, null),
  "frío": E("cold", "adj", "m", null),
  "rico": E("rich/delicious", "adj", "m", "Also means 'delicious' for food"),
  "pobre": E("poor", "adj", null, null),
  "barato": E("cheap", "adj", "m", null),
  "caro": E("expensive", "adj", "m", null),
  "fácil": E("easy", "adj", null, null),
  "difícil": E("difficult", "adj", null, null),
  "mismo": E("same/self", "adj", "m", null),
  "otro": E("other/another", "adj", "m", null),
  "otra": E("other (f)", "adj", "f", null),
  "primero": E("first", "adj", "m", null),
  "primera": E("first (f)", "adj", "f", null),
  "último": E("last", "adj", "m", null),
  "mejor": E("better/best", "adj", null, null),
  "peor": E("worse/worst", "adj", null, null),
  "favorito": E("favorite", "adj", "m", null),
  "increíble": E("incredible", "adj", null, null),
  "importante": E("important", "adj", null, null),
  "necesario": E("necessary", "adj", "m", null),
  "posible": E("possible", "adj", null, null),
  "seguro": E("safe/sure", "adj", "m", null),
  "listo": E("ready/smart", "adj", "m", null),
  "contento": E("happy/content", "adj", "m", null),
  "triste": E("sad", "adj", null, null),
  "enfermo": E("sick", "adj", "m", null),
  "enferma": E("sick (f)", "adj", "f", null),
  "cansado": E("tired", "adj", "m", null),
  "ocupado": E("busy", "adj", "m", null),
  "solo": E("only", "adv", null, null),
  "lleno": E("full", "adj", "m", null),
  "vacío": E("empty", "adj", "m", null),
  "abierto": E("open", "adj", "m", null),
  "cerrado": E("closed", "adj", "m", null),
  "amable": E("kind/friendly", "adj", null, null),
  "simpático": E("nice/likable", "adj", "m", null),
  "frito": E("fried", "adj", "m", null),
  "muy": E("very", "adv", null, null),
  "bien": E("well/good", "adv", null, null),
  "mal": E("bad/badly", "adv", null, null),
  "mucho": E("much/a lot", "adv", null, null),
  "poco": E("little/few", "adv", null, null),
  "más": E("more/most", "adv", null, null),
  "menos": E("less/least", "adv", null, null),
  "ya": E("already/now", "adv", null, null),
  "todavía": E("still/yet", "adv", null, null),
  "también": E("also/too", "adv", null, null),
  "tampoco": E("neither/not either", "adv", null, null),
  "siempre": E("always", "adv", null, null),
  "nunca": E("never", "adv", null, null),
  "ahora": E("now", "adv", null, null),
  "hoy": E("today", "adv", null, null),
  "ayer": E("yesterday", "adv", null, null),
  "después": E("after/later", "adv", null, null),
  "antes": E("before", "adv", null, null),
  "entonces": E("then/so", "adv", null, null),
  "aquí": E("here", "adv", null, null),
  "ahí": E("there", "adv", null, null),
  "allá": E("over there", "adv", null, null),
  "cerca": E("near", "adv", null, null),
  "lejos": E("far", "adv", null, null),
  "arriba": E("up/above", "adv", "In Nica: east", null),
  "abajo": E("down/below", "adv", "In Nica: west", null),
  "dentro": E("inside", "adv", null, null),
  "fuera": E("outside", "adv", null, null),
  "despacio": E("slowly", "adv", null, null),
  "casi": E("almost", "adv", null, null),
  "claro": E("of course", "adv", null, null),
  "de": E("of/from", "prep", null, null),
  "en": E("in/on/at", "prep", null, null),
  "con": E("with", "prep", null, null),
  "sin": E("without", "prep", null, null),
  "por": E("for/by/through", "prep", null, null),
  "para": E("for/to", "prep", null, null),
  "a": E("to/at", "prep", null, null),
  "hasta": E("until/up to", "prep", null, null),
  "desde": E("from/since", "prep", null, null),
  "entre": E("between", "prep", null, null),
  "sobre": E("on/about", "prep", null, null),
  "durante": E("during", "prep", null, null),
  "hacia": E("toward", "prep", null, null),
  "y": E("and", "conj", null, null),
  "o": E("or", "conj", null, null),
  "pero": E("but", "conj", null, null),
  "porque": E("because", "conj", null, null),
  "que": E("that/which", "conj", null, null),
  "si": E("if", "conj", null, null),
  "cuando": E("when", "conj", null, null),
  "donde": E("where", "conj", null, null),
  "aunque": E("although", "conj", null, null),
  "mientras": E("while", "conj", null, null),
  "ni": E("neither/nor", "conj", null, null),
  "qué": E("what?", "pron", null, null),
  "quién": E("who?", "pron", null, null),
  "cómo": E("how?", "adv", null, null),
  "dónde": E("where?", "adv", null, null),
  "cuándo": E("when?", "adv", null, null),
  "cuánto": E("how much?", "adv", null, null),
  "cuál": E("which?", "pron", null, null),
  "por qué": E("why?", "adv", null, null),
  "uno": E("one", "num", null, null),
  "dos": E("two", "num", null, null),
  "tres": E("three", "num", null, null),
  "cuatro": E("four", "num", null, null),
  "cinco": E("five", "num", null, null),
  "seis": E("six", "num", null, null),
  "siete": E("seven", "num", null, null),
  "ocho": E("eight", "num", null, null),
  "nueve": E("nine", "num", null, null),
  "diez": E("ten", "num", null, null),
  "once": E("eleven", "num", null, null),
  "doce": E("twelve", "num", null, null),
  "veinte": E("twenty", "num", null, null),
  "cien": E("hundred", "num", null, null),
  "mil": E("thousand", "num", null, null),
  "hola": E("hello", "intj", null, null),
  "adiós": E("goodbye", "intj", null, null),
  "gracias": E("thank you", "intj", null, null),
  "perdón": E("sorry/pardon", "intj", null, null),
  "permiso": E("excuse me", "n", "m", "'Con permiso'=Excuse me (passing)"),
  "disculpe": E("excuse me (formal)", "v", null, null),
  "salud": E("health/bless you", "n", "f", "Said when sneezing or toasting"),
  "cuidado": E("careful/watch out", "n", "m", null),
  "sí": E("yes", "adv", null, null),
  "no": E("no/not", "adv", null, null),
  "nada": E("nothing/you're welcome", "pron", "De nada=You're welcome", null),
  "algo": E("something", "pron", null, null),
  "alguien": E("someone", "pron", null, null),
  "nadie": E("nobody", "pron", null, null),
  "cada": E("each/every", "adj", null, null),
  "todo": E("all/everything", "pron", "m", null),
  "todos": E("everyone", "pron", "m", null),
  "este": E("this", "adj", "m", null),
  "esta": E("this (f)", "adj", "f", null),
  "ese": E("that", "adj", "m", null),
  "esa": E("that (f)", "adj", "f", null),
  "eso": E("that (thing)", "pron", null, null),
  "estos": E("these", "adj", "m", null),
  "esos": E("those", "adj", "m", null),
  "del": E("of the", "contr", null, null),
  "al": E("to the", "contr", null, null),
  "hay": E("there is/are", "v", null, null),
  "favor": E("favor", "n", "m", "Por favor=please"),
  "norte": E("north", "n", "m", null),
  "sur": E("south", "n", "m", null),
  "derecho": E("straight", "adv", null, null),
  "izquierda": E("left", "n", "f", null),
  "derecha": E("right (dir)", "n", "f", null),
  "vaya": E("go (subj)", "v", null, "Que le vaya bien=Take care"),
};

// ── STORIES ──
final List<Story> bundledStories = [
  Story(
    id: "s01",
    title: "La fritanga de doña Carmen",
    ph: 0,
    diff: 1,
    desc: "Your first meal in Managua",
    wu: [
      "fritanga",
      "querés",
      "dale",
      "gallo",
      "pinto",
      "tuani",
      "tenés",
      "doña",
      "comida",
      "muy"
    ],
    sn: [
      Sn("Yo llegar a Managua por la noche.", "I arrive in Managua at night."),
      Sn("Tengo mucho hambre.", "I'm very hungry."),
      Sn("En la calle hay una fritanga.", "On the street there's a fritanga."),
      Sn("La mujer se llama doña Carmen.", "The woman's name is doña Carmen."),
      Sn("\"¡Hola! ¿Qué querés comer?\" me dice con una gran sonrisa.",
          "\"Hi! What do you want to eat?\" she says with a big smile."),
      Sn("Yo no sé qué decir. Todo se ve muy bien.",
          "I don't know what to say. Everything looks really good."),
      Sn("Hay gallo pinto, hay carne, hay tajadas de plátano, hay queso frito.",
          "There's gallo pinto, meat, plantain slices, and fried cheese."),
      Sn("\"Dale pues, te doy un poco de todo,\" dice ella.",
          "\"Okay then, I'll give you a little of everything.\""),
      Sn("La comida es muy buena. El gallo pinto tiene un sabor increíble.",
          "The food is really good. The gallo pinto has an incredible flavor."),
      Sn("\"¡Tuani!\" dice ella. \"Mañana tenés que venir otra vez.\"",
          "\"Awesome!\" she says. \"Tomorrow you have to come again.\""),
      Sn("La fritanga de doña Carmen es mi lugar favorito en Managua.",
          "Doña Carmen's fritanga is my favorite place in Managua."),
    ],
  ),
  Story(
    id: "s02",
    title: "El mercado",
    ph: 0,
    diff: 1,
    desc: "Shopping at a Nicaraguan market",
    wu: [
      "mercado",
      "gente",
      "córdobas",
      "querés",
      "dale",
      "chavalo",
      "mirá",
      "dinero",
      "comprar",
      "cuánto"
    ],
    sn: [
      Sn("El mercado es grande. Hay mucha gente y mucho ruido.",
          "The market is big. Lots of people and noise."),
      Sn("Yo necesito comprar comida para la casa.",
          "I need to buy food for the house."),
      Sn("\"Buenos días. ¿Cuánto por las naranjas?\"",
          "\"Good morning. How much for the oranges?\""),
      Sn("\"Diez córdobas la bolsa,\" me dice.",
          "\"Ten córdobas per bag,\" she tells me."),
      Sn("\"Pero si querés tres, te los dejo en doce.\"",
          "\"But if you want three, I'll let them go for twelve.\""),
      Sn("\"Dale pues, me llevo tres mangos y una bolsa de naranjas.\"",
          "\"Okay then, I'll take three mangos and a bag of oranges.\""),
      Sn("Un hombre me dice: \"Mirá, ahí donde ese chavalo está es donde venden el mejor arroz.\"",
          "\"Look, where that kid is — that's where they sell the best rice.\""),
      Sn("El chavalo es muy amable. \"Aquí tenés. ¿Algo más?\"",
          "The kid is very friendly. \"Here you go. Anything else?\""),
      Sn("Le doy el dinero. \"Gracias, que le vaya bien.\"",
          "I give him the money. \"Thanks, take care.\""),
      Sn("En el mercado siempre hay algo nuevo. Me gusta este lugar.",
          "At the market there's always something new. I like this place."),
    ],
  ),
  Story(
    id: "s03",
    title: "¿De dónde venís?",
    ph: 0,
    diff: 2,
    desc: "Making friends at a pulpería",
    wu: [
      "venís",
      "sos",
      "ideay",
      "sabés",
      "querés",
      "tenés",
      "podés",
      "dale",
      "tuani",
      "barrio"
    ],
    sn: [
      Sn("Hay una pulpería cerca de mi casa. Cada tarde voy a comprar agua.",
          "There's a corner shop near my house. Every afternoon I buy water."),
      Sn("Un día, un hombre me habla. \"Vos no sos de aquí, ¿verdad?\"",
          "One day, a man talks to me. \"You're not from here, right?\""),
      Sn("\"Soy de Estados Unidos.\" \"¡Ideay! ¿Y qué hacés en Nicaragua?\"",
          "\"I'm from the US.\" \"Well! What are you doing in Nicaragua?\""),
      Sn("\"Quiero aprender español y conocer el país.\"",
          "\"I want to learn Spanish and get to know the country.\""),
      Sn("\"Pues ya estás en el mejor lugar, hermano. Aquí la gente es tuani.\"",
          "\"You're already in the best place, bro. People here are cool.\""),
      Sn("\"Mirá, yo soy Roberto. Si querés aprender como nica, tenés que salir con nosotros.\"",
          "\"I'm Roberto. If you want to learn like a Nica, you have to hang with us.\""),
      Sn("\"No podés aprender solo en la casa con un libro.\"",
          "\"You can't learn alone at home with a book.\""),
      Sn("\"Dale pues. Mañana en la noche vamos al parque.\"",
          "\"Alright. Tomorrow night we're going to the park.\""),
      Sn("Para aprender una lengua, tenés que vivir en ella. No solo estudiar. Vivir.",
          "To learn a language, you have to live in it. Not just study. Live."),
    ],
  ),
  Story(
    id: "s04",
    title: "El taxi",
    ph: 0,
    diff: 2,
    desc: "Getting around Managua",
    wu: [
      "taxi",
      "chofer",
      "cuadras",
      "norte",
      "derecho",
      "cuánto",
      "córdobas",
      "aquí",
      "dale",
      "rápido"
    ],
    sn: [
      Sn("Necesito ir al otro lado de Managua. Paro un taxi en la calle.",
          "I need to cross Managua. I flag a taxi."),
      Sn("\"¿Para dónde vas?\" me pregunta el chofer.",
          "\"Where are you going?\" asks the driver."),
      Sn("\"A la UCA, por favor.\" \"Dale. ¿Sabés cuánto es?\"",
          "\"To the UCA, please.\" \"Okay. Know how much?\""),
      Sn("\"Cien córdobas.\" \"¿No puede ser menos?\" El chofer se ríe. \"Ochenta.\"",
          "\"A hundred córdobas.\" \"Can't it be less?\" He laughs. \"Eighty.\""),
      Sn("Vamos rápido por las calles de Managua.",
          "We go fast through the streets."),
      Sn("\"Mirá, eso es el lago de Managua,\" me dice.",
          "\"Look, that's Lake Managua,\" he tells me."),
      Sn("\"Para llegar a tu casa desde la UCA: dos cuadras al norte, una cuadra arriba.\"",
          "\"To get home from UCA: two blocks north, one block east.\""),
      Sn("\"Aquí arriba es al este, donde sale el sol. Abajo es al oeste.\"",
          "\"Here 'arriba' is east, where the sun rises. 'Abajo' is west.\""),
      Sn("Le doy los ochenta córdobas. \"Gracias, que le vaya bien.\"",
          "I pay eighty córdobas. \"Thanks, take care.\""),
    ],
  ),
  Story(
    id: "s05",
    title: "Estoy enfermo",
    ph: 0,
    diff: 2,
    desc: "Getting sick & finding medicine",
    wu: [
      "enfermo",
      "dolor",
      "cabeza",
      "estómago",
      "farmacia",
      "medicina",
      "pastillas",
      "cuerpo",
      "dormir",
      "ayudar"
    ],
    sn: [
      Sn("Hoy no me siento bien. Me duele la cabeza y el estómago.",
          "I don't feel well. My head and stomach hurt."),
      Sn("Creo que la comida de ayer me hizo mal.",
          "I think yesterday's food made me sick."),
      Sn("Roberto viene. \"¡Ideay! Te ves mal, hermano. ¿Qué te pasa?\"",
          "Roberto comes. \"Whoa! You look bad, bro. What's wrong?\""),
      Sn("\"Estoy enfermo. Me duele todo el cuerpo.\"",
          "\"I'm sick. My whole body hurts.\""),
      Sn("\"Mirá, aquí cerca hay una farmacia. Yo voy a comprar medicina para vos.\"",
          "\"There's a pharmacy nearby. I'll buy medicine for you.\""),
      Sn("Roberto vuelve con pastillas. \"Tomá estas con agua. Una cada ocho horas.\"",
          "Roberto returns with pills. \"Take these with water. One every eight hours.\""),
      Sn("\"Y tenés que descansar. Nada de salir hoy.\"",
          "\"And you need to rest. No going out today.\""),
      Sn("\"Gracias, hermano. Sos muy amable.\" \"Dale pues. Para eso son los amigos.\"",
          "\"Thanks, bro.\" \"No worries. That's what friends are for.\""),
      Sn("Tomo la medicina y duermo todo el día. Al otro día me siento mucho mejor.",
          "I take the medicine and sleep all day. Next day I feel much better."),
    ],
  ),
  Story(
    id: "s06",
    title: "La fiesta del barrio",
    ph: 0,
    diff: 3,
    desc: "A neighborhood party",
    wu: [
      "familia",
      "música",
      "contento",
      "todos",
      "conocer",
      "amigos",
      "noche",
      "increíble",
      "así",
      "fiesta"
    ],
    sn: [
      Sn("Es sábado. Roberto me dice: \"Hoy hay fiesta en el barrio. Tenés que venir.\"",
          "It's Saturday. Roberto: \"There's a party tonight. You have to come.\""),
      Sn("Llego a la fiesta. Hay música, comida, cerveza. Todos están contentos.",
          "I arrive. Music, food, beer. Everyone's happy."),
      Sn("Roberto me presenta a su familia. \"Esta es mi madre, doña Rosa.\"",
          "Roberto introduces his family. \"This is my mother, doña Rosa.\""),
      Sn("\"Mucho gusto. Roberto es muy buen amigo,\" les digo.",
          "\"Nice to meet you. Roberto is a great friend,\" I say."),
      Sn("\"¡Ideay! Vos sos el chele del que habla Roberto,\" dice doña Rosa.",
          "\"So you're the foreigner Roberto talks about,\" says doña Rosa."),
      Sn("\"Bienvenido a nuestra casa. Aquí tenés tu casa también.\"",
          "\"Welcome. This is your home too.\""),
      Sn("La comida es increíble: nacatamales, vigorón, tajadas con queso.",
          "The food is incredible: nacatamales, vigorón, plantain chips with cheese."),
      Sn("Karla me dice: \"La mejor forma de aprender es así, con la gente.\"",
          "Karla tells me: \"The best way to learn is like this, with people.\""),
      Sn("Esta noche hablo más español que nunca. No es perfecto, pero la gente me entiende.",
          "Tonight I speak more Spanish than ever. Not perfect, but people understand me."),
      Sn("Eso es lo que importa.", "That's what matters."),
    ],
  ),
  Story(
    id: "s07",
    title: "Mi primer trabajo",
    ph: 1,
    diff: 3,
    desc: "Getting your first job in Nicaragua",
    wu: [
      "trabajo",
      "trabajar",
      "necesitar",
      "dinero",
      "hablar",
      "saber",
      "poder",
      "empezar",
      "semana",
      "pagar"
    ],
    sn: [
      Sn("Ya tengo dos meses en Nicaragua. Mi dinero se está terminando.",
          "I've been in Nicaragua two months. My money is running out."),
      Sn("Roberto me dice: \"Mirá, mi amigo tiene un café y necesita a alguien que hable inglés.\"",
          "Roberto: \"My friend has a café and needs someone who speaks English.\""),
      Sn("\"¿Para qué necesita inglés?\" \"Porque van muchos turistas.\"",
          "\"Why does he need English?\" \"Because lots of tourists go there.\""),
      Sn("Voy al café. El dueño se llama Marcos.",
          "I go to the café. The owner is Marcos."),
      Sn("\"¿Sabés hacer café?\" me pregunta. \"Sí, puedo aprender rápido.\"",
          "\"Do you know how to make coffee?\" \"Yes, I can learn fast.\""),
      Sn("\"Dale. Empezás mañana. De lunes a viernes, ocho horas. Te pago por semana.\"",
          "\"Okay. You start tomorrow. Monday to Friday, eight hours. I pay weekly.\""),
      Sn("En el trabajo hablo español todo el día con los otros trabajadores.",
          "At work I speak Spanish all day with the other workers."),
      Sn("Con los turistas hablo inglés, pero después cambio a español.",
          "With tourists I speak English, but then switch to Spanish."),
      Sn("Mi español mejora cada semana. Ahora pienso en español sin traducir del inglés.",
          "My Spanish improves every week. Now I think in Spanish without translating."),
    ],
  ),
  Story(
    id: "s08",
    title: "La llamada de teléfono",
    ph: 1,
    diff: 3,
    desc: "Your first phone call in Spanish",
    wu: [
      "teléfono",
      "llamar",
      "hablar",
      "entender",
      "esperar",
      "problema",
      "número",
      "poder",
      "decir",
      "favor"
    ],
    sn: [
      Sn("Mi teléfono suena. Es un número que no conozco.",
          "My phone rings. A number I don't know."),
      Sn("\"¿Aló?\" \"Hola, ¿es Miguel? Soy Karla.\"",
          "\"Hello?\" \"Hi, is this Miguel? It's Karla.\""),
      Sn("\"¡Karla! ¿Cómo estás?\" \"Bien, mirá, te llamo porque hay un problema.\"",
          "\"Karla! How are you?\" \"Good, listen, I'm calling because there's a problem.\""),
      Sn("\"Roberto está enfermo y no puede ir al trabajo. ¿Podés decirle a Marcos?\"",
          "\"Roberto is sick and can't go to work. Can you tell Marcos?\""),
      Sn("Yo entiendo todo. Hace un mes no podía entender una llamada en español.",
          "I understand everything. A month ago I couldn't understand a phone call in Spanish."),
      Sn("\"Sí, claro. Yo le digo. ¿Necesita algo Roberto?\"",
          "\"Yes, of course. I'll tell him. Does Roberto need anything?\""),
      Sn("\"No, solo descansar. Gracias, Miguel. Sos muy amable.\"",
          "\"No, just rest. Thanks, Miguel. You're very kind.\""),
      Sn("Después de la llamada, me siento bien. Puedo hablar por teléfono en español.",
          "After the call, I feel good. I can talk on the phone in Spanish."),
      Sn("Eso es un gran paso. El teléfono es más difícil que hablar en persona.",
          "That's a big step. Phone is harder than in-person."),
    ],
  ),
  Story(
    id: "s09",
    title: "Perdido en Managua",
    ph: 1,
    diff: 4,
    desc: "Getting lost and finding your way",
    wu: [
      "perdido",
      "dónde",
      "derecho",
      "izquierda",
      "esquina",
      "norte",
      "sur",
      "preguntar",
      "saber",
      "llegar"
    ],
    sn: [
      Sn("Hoy voy a un lugar nuevo en Managua. Pero me pierdo.",
          "Today I go somewhere new in Managua. But I get lost."),
      Sn("No sé dónde estoy. Las calles no tienen nombre.",
          "I don't know where I am. The streets have no names."),
      Sn("Le pregunto a una señora: \"Disculpe, ¿sabe dónde está la Rotonda Santo Domingo?\"",
          "I ask a woman: \"Excuse me, do you know where the Santo Domingo roundabout is?\""),
      Sn("\"Sí, mirá. Vas derecho dos cuadras, después a la izquierda en la esquina.\"",
          "\"Yes, look. Go straight two blocks, then left at the corner.\""),
      Sn("\"Después seguís tres cuadras más al norte, y ahí la ves.\"",
          "\"Then continue three more blocks north, and you'll see it.\""),
      Sn("Sigo sus instrucciones. Derecho, izquierda, norte.",
          "I follow her directions. Straight, left, north."),
      Sn("Pero me pierdo otra vez. Le pregunto a un chavalo.",
          "But I get lost again. I ask a kid."),
      Sn("\"¿La Rotonda? Está cerquita. Mirá, yo voy para allá. Vení conmigo.\"",
          "\"The roundabout? It's close. Look, I'm going there. Come with me.\""),
      Sn("Caminamos juntos. Me cuenta sobre su escuela y su familia.",
          "We walk together. He tells me about his school and family."),
      Sn("Llego a la Rotonda. Perderme fue la mejor cosa del día.",
          "I reach the roundabout. Getting lost was the best thing today."),
    ],
  ),
  Story(
    id: "s10",
    title: "La tormenta",
    ph: 1,
    diff: 4,
    desc: "A tropical storm hits",
    wu: [
      "lluvia",
      "agua",
      "casa",
      "fuerte",
      "puerta",
      "ventana",
      "noche",
      "miedo",
      "esperar",
      "todo"
    ],
    sn: [
      Sn("Es octubre, la temporada de lluvia en Nicaragua.",
          "It's October, rainy season in Nicaragua."),
      Sn("Una tarde el cielo se pone oscuro muy rápido.",
          "One afternoon the sky gets dark very fast."),
      Sn("Empieza a llover. Pero no es lluvia normal. Es una tormenta fuerte.",
          "It starts to rain. Not normal rain. A strong storm."),
      Sn("El agua entra por abajo de la puerta. Cierro las ventanas.",
          "Water comes under the door. I close the windows."),
      Sn("La luz se va. Toda la casa está oscura.",
          "The power goes out. The whole house is dark."),
      Sn("Roberto viene a mi puerta. \"¿Estás bien? Vení a mi casa. Es más segura.\"",
          "Roberto comes to my door. \"You okay? Come to my house. It's safer.\""),
      Sn("Voy con Roberto. Su familia está en la sala con velas.",
          "I go with Roberto. His family is in the living room with candles."),
      Sn("Doña Rosa me da café caliente. \"No te preocupés. Esto pasa cada año.\"",
          "Doña Rosa gives me hot coffee. \"Don't worry. This happens every year.\""),
      Sn("Esperamos juntos. La familia habla, ríe, cuenta historias.",
          "We wait together. The family talks, laughs, tells stories."),
      Sn("La tormenta es fuerte, pero adentro me siento seguro. Tengo una segunda familia aquí.",
          "The storm is strong, but inside I feel safe. I have a second family here."),
    ],
  ),
  Story(
    id: "s11",
    title: "La discusión",
    ph: 2,
    diff: 5,
    desc: "Your first argument in Spanish",
    wu: [
      "problema",
      "creer",
      "pensar",
      "decir",
      "entender",
      "razón",
      "mejor",
      "solo",
      "verdad",
      "cambiar"
    ],
    sn: [
      Sn("Marcos, el dueño del café, quiere cambiar mi horario de trabajo.",
          "Marcos, the café owner, wants to change my work schedule."),
      Sn("\"Miguel, necesito que trabajés los sábados también.\"",
          "\"Miguel, I need you to work Saturdays too.\""),
      Sn("\"Pero los sábados yo estudio español con un profesor.\"",
          "\"But Saturdays I study Spanish with a teacher.\""),
      Sn("\"Lo siento, pero necesito a alguien los sábados. Es el día más ocupado.\"",
          "\"Sorry, but I need someone on Saturdays. It's the busiest day.\""),
      Sn("\"Marcos, yo creo que eso no es justo. No estaba en nuestro acuerdo.\"",
          "\"Marcos, I don't think that's fair. It wasn't in our agreement.\""),
      Sn("Marcos se queda callado un momento. Yo pienso que se va a enojar.",
          "Marcos goes quiet. I think he's going to get angry."),
      Sn("\"Tenés razón,\" dice. \"No estaba en el acuerdo. Mirá, ¿qué te parece si trabajás solo medio día el sábado?\"",
          "\"You're right,\" he says. \"It wasn't in the deal. How about half a day Saturday?\""),
      Sn("\"Dale, eso sí puedo hacer.\"", "\"Okay, I can do that.\""),
      Sn("Es la primera vez que tengo una discusión seria en español. Y la gané.",
          "It's my first serious argument in Spanish. And I won."),
      Sn("No solo puedo hablar español. Puedo defenderme en español.",
          "I can't just speak Spanish. I can defend myself in Spanish."),
    ],
  ),
  Story(
    id: "s12",
    title: "Seis meses después",
    ph: 2,
    diff: 5,
    desc: "Reflecting on your journey",
    wu: [
      "tiempo",
      "pensar",
      "sentir",
      "saber",
      "poder",
      "mejor",
      "todavía",
      "siempre",
      "vida",
      "mundo"
    ],
    sn: [
      Sn("Hoy se cumplen seis meses desde que llegué a Nicaragua.",
          "Today marks six months since I arrived in Nicaragua."),
      Sn("Pienso en el primer día, cuando no sabía nada de español.",
          "I think about day one, when I knew no Spanish."),
      Sn("Ahora puedo ir al mercado y regatear. Puedo tomar un taxi sin problema.",
          "Now I can go to the market and haggle. Take a taxi, no problem."),
      Sn("Puedo hacer amigos, contar chistes, y hasta discutir en español.",
          "I can make friends, tell jokes, even argue in Spanish."),
      Sn("Todavía cometo errores. A veces busco una palabra y no la encuentro.",
          "I still make mistakes. Sometimes I search for a word and can't find it."),
      Sn("Pero ya no tengo miedo de hablar. Ese es el cambio más grande.",
          "But I'm no longer afraid to speak. That's the biggest change."),
      Sn("Roberto me dice: \"Hermano, ya hablás como nica.\"",
          "Roberto tells me: \"Bro, you already talk like a Nica.\""),
      Sn("No es verdad todavía. Pero cada día estoy más cerca.",
          "It's not true yet. But every day I'm closer."),
      Sn("La fluidez no es saber todas las palabras. Es poder vivir tu vida en otro idioma.",
          "Fluency isn't knowing every word. It's being able to live your life in another language."),
      Sn("Y eso es lo que estoy haciendo.", "And that's what I'm doing."),
    ],
  ),
];

// ── GRAMMAR PATTERNS ──
final List<Pattern> bundledPatterns = [
  Pattern(
    id: 'voseo',
    title: 'Voseo — The Nica \'You\'',
    min: 3,
    trigger: [
      'vos',
      'sos',
      'tenés',
      'querés',
      'sabés',
      'podés',
      'venís',
      'hacés',
      'mirá',
      'andá',
      'tomá'
    ],
    text: '''Nicaragua uses 'vos' instead of 'tú'. This changes conjugations:

• Tú tienes → Vos tenés
• Tú quieres → Vos querés
• Tú sabes → Vos sabés

Pattern: stress the last syllable, drop -ie- stems.

Commands: stress final syllable:
• Mira → Mirá • Anda → Andá • Toma → Tomá

You'll never hear 'tú' in Nicaragua.''',
  ),
  Pattern(
    id: 'ser_estar',
    title: 'Ser vs Estar — Two \'Be\' Verbs',
    min: 4,
    trigger: ['soy', 'es', 'son', 'estoy', 'está', 'están'],
    text: '''SER — permanent things:
• Soy de EEUU (origin)
• Es doctora (profession)
• Es grande (inherent quality)

ESTAR — temporary/location:
• Estoy en Managua (location)
• Estoy enfermo (temp state)
• Está bueno (right now)

If it can change → estar.
If it defines what something IS → ser.''',
  ),
  Pattern(
    id: 'me_gusta',
    title: 'Me gusta — Backwards \'Liking\'',
    min: 3,
    trigger: ['gusta', 'gustan', 'me'],
    text: '''English: 'I like the food'
Spanish: 'Me gusta la comida' (food pleases me)

Subject is FLIPPED:
• Me gusta el arroz (I like rice)
• Me gustan los mangos (I like mangos)
• ¿Te gusta Nicaragua?

Gusta = one thing. Gustan = multiple things.''',
  ),
  Pattern(
    id: 'nica_dir',
    title: 'Nica Directions — No Street Names',
    min: 2,
    trigger: ['cuadras', 'norte', 'sur', 'arriba', 'abajo', 'esquina'],
    text: '''Managua has no street names. Everything is landmarks + compass:

• '2 cuadras al norte del parque'
• Arriba = east (sun comes up)
• Abajo = west (sun goes down)
• Al lago = toward Lake Managua

'De la Rotonda, 3 arriba, 1 al sur, casa esquinera.\'''',
  ),
  Pattern(
    id: 'tener_expr',
    title: 'Tener Expressions — \'To Have\' = \'To Be\'',
    min: 3,
    trigger: ['tengo', 'tiene', 'hambre', 'años', 'miedo', 'razón'],
    text: '''Spanish uses 'tener' (to have) where English uses 'to be':

• Tengo hambre = I'm hungry (I have hunger)
• Tengo 25 años = I'm 25 (I have 25 years)
• Tengo miedo = I'm scared (I have fear)
• Tiene razón = He's right (He has reason)
• Tengo sed = I'm thirsty (I have thirst)
• Tengo frío/calor = I'm cold/hot''',
  ),
];

// ── RUNTIME ACCESSORS ──
// The app reads D / STORIES / PATTERNS. These now resolve to the live,
// mutable content held by the Content service (which is seeded from the
// bundled* data above and augmented by lessons fetched from GitHub).
Map<String, E> get D => Content.dict;
List<Story> get STORIES => Content.stories;
List<Pattern> get PATTERNS => Content.patterns;

// ── PHASE METADATA (the 8-phase ladder, zero to native) ──
const Map<int, List<String>> _phaseInfo = {
  0: ['Survival', 'Greetings, numbers, basic needs'],
  1: ['Getting Around', 'Markets, taxis, directions, transactions'],
  2: ['Connecting', 'Small talk, friends, talking about yourself'],
  3: ['Holding Your Own', 'Opinions, problems, plans, disagreements'],
  4: ['Close to the Heart', 'Your partner, family, affection, conflict'],
  5: ['Fitting In', 'Humor, fast speech, idioms, slang in the wild'],
  6: ['Sounding Local', 'Nuance, double meanings, abstract talk'],
  7: ['Native-Like', 'Wordplay, in-jokes, the long tail'],
};
String phaseName(int ph) => _phaseInfo[ph]?[0] ?? 'Phase $ph';
String phaseDesc(int ph) => _phaseInfo[ph]?[1] ?? '';
// Phases that actually have content (from manifest if available, else loaded stories).
List<int> phaseNumbers() {
  final set = <int>{};
  final m = Content.manifest;
  if (m != null && m.lessons.isNotEmpty) {
    for (final l in m.lessons) {
      set.add(l.phase);
    }
  } else {
    for (final s in STORIES) {
      set.add(s.ph);
    }
  }
  final list = set.toList()..sort();
  return list;
}

// IDs of lessons in a phase (manifest-aware).
List<String> phaseLessonIds(int ph) {
  final m = Content.manifest;
  if (m != null && m.lessons.any((l) => l.phase == ph)) {
    return m.lessons.where((l) => l.phase == ph).map((l) => l.id).toList();
  }
  return STORIES.where((s) => s.ph == ph).map((s) => s.id).toList();
}

// ══════════════════════════════════════════════
// VERB CONJUGATION ENGINE
// ══════════════════════════════════════════════
const List<String> SUBJECTS = ["yo", "vos", "él/ella", "nosotros", "ellos"];

const Map<String, List<String>> _regAr = {
  "present": ["o", "ás", "a", "amos", "an"],
  "past": ["é", "aste", "ó", "amos", "aron"],
  "future": ["aré", "arás", "ará", "aremos", "arán"],
};
const Map<String, List<String>> _regEr = {
  "present": ["o", "és", "e", "emos", "en"],
  "past": ["í", "iste", "ió", "imos", "ieron"],
  "future": ["eré", "erás", "erá", "eremos", "erán"],
};
const Map<String, List<String>> _regIr = {
  "present": ["o", "ís", "e", "imos", "en"],
  "past": ["í", "iste", "ió", "imos", "ieron"],
  "future": ["iré", "irás", "irá", "iremos", "irán"],
};

const Map<String, Map<String, List<String>>> IRREG = {
  "ser": {
    "present": ["soy", "sos", "es", "somos", "son"],
    "past": ["fui", "fuiste", "fue", "fuimos", "fueron"],
    "future": ["seré", "serás", "será", "seremos", "serán"]
  },
  "estar": {
    "present": ["estoy", "estás", "está", "estamos", "están"],
    "past": ["estuve", "estuviste", "estuvo", "estuvimos", "estuvieron"],
    "future": ["estaré", "estarás", "estará", "estaremos", "estarán"]
  },
  "tener": {
    "present": ["tengo", "tenés", "tiene", "tenemos", "tienen"],
    "past": ["tuve", "tuviste", "tuvo", "tuvimos", "tuvieron"],
    "future": ["tendré", "tendrás", "tendrá", "tendremos", "tendrán"]
  },
  "ir": {
    "present": ["voy", "vas", "va", "vamos", "van"],
    "past": ["fui", "fuiste", "fue", "fuimos", "fueron"],
    "future": ["iré", "irás", "irá", "iremos", "irán"]
  },
  "hacer": {
    "present": ["hago", "hacés", "hace", "hacemos", "hacen"],
    "past": ["hice", "hiciste", "hizo", "hicimos", "hicieron"],
    "future": ["haré", "harás", "hará", "haremos", "harán"]
  },
  "decir": {
    "present": ["digo", "decís", "dice", "decimos", "dicen"],
    "past": ["dije", "dijiste", "dijo", "dijimos", "dijeron"],
    "future": ["diré", "dirás", "dirá", "diremos", "dirán"]
  },
  "poder": {
    "present": ["puedo", "podés", "puede", "podemos", "pueden"],
    "past": ["pude", "pudiste", "pudo", "pudimos", "pudieron"],
    "future": ["podré", "podrás", "podrá", "podremos", "podrán"]
  },
  "querer": {
    "present": ["quiero", "querés", "quiere", "queremos", "quieren"],
    "past": ["quise", "quisiste", "quiso", "quisimos", "quisieron"],
    "future": ["querré", "querrás", "querrá", "querremos", "querrán"]
  },
  "saber": {
    "present": ["sé", "sabés", "sabe", "sabemos", "saben"],
    "past": ["supe", "supiste", "supo", "supimos", "supieron"],
    "future": ["sabré", "sabrás", "sabrá", "sabremos", "sabrán"]
  },
  "dar": {
    "present": ["doy", "das", "da", "damos", "dan"],
    "past": ["di", "diste", "dio", "dimos", "dieron"],
    "future": ["daré", "darás", "dará", "daremos", "darán"]
  },
  "ver": {
    "present": ["veo", "ves", "ve", "vemos", "ven"],
    "past": ["vi", "viste", "vio", "vimos", "vieron"],
    "future": ["veré", "verás", "verá", "veremos", "verán"]
  },
  "venir": {
    "present": ["vengo", "venís", "viene", "venimos", "vienen"],
    "past": ["vine", "viniste", "vino", "vinimos", "vinieron"],
    "future": ["vendré", "vendrás", "vendrá", "vendremos", "vendrán"]
  },
  "poner": {
    "present": ["pongo", "ponés", "pone", "ponemos", "ponen"],
    "past": ["puse", "pusiste", "puso", "pusimos", "pusieron"],
    "future": ["pondré", "pondrás", "pondrá", "pondremos", "pondrán"]
  },
  "salir": {
    "present": ["salgo", "salís", "sale", "salimos", "salen"],
    "past": ["salí", "saliste", "salió", "salimos", "salieron"],
    "future": ["saldré", "saldrás", "saldrá", "saldremos", "saldrán"]
  },
  "dormir": {
    "present": ["duermo", "dormís", "duerme", "dormimos", "duermen"],
    "past": ["dormí", "dormiste", "durmió", "dormimos", "durmieron"],
    "future": ["dormiré", "dormirás", "dormirá", "dormiremos", "dormirán"]
  },
  "pedir": {
    "present": ["pido", "pedís", "pide", "pedimos", "piden"],
    "past": ["pedí", "pediste", "pidió", "pedimos", "pidieron"],
    "future": ["pediré", "pedirás", "pedirá", "pediremos", "pedirán"]
  },
  "seguir": {
    "present": ["sigo", "seguís", "sigue", "seguimos", "siguen"],
    "past": ["seguí", "seguiste", "siguió", "seguimos", "siguieron"],
    "future": ["seguiré", "seguirás", "seguirá", "seguiremos", "seguirán"]
  },
  "sentir": {
    "present": ["siento", "sentís", "siente", "sentimos", "sienten"],
    "past": ["sentí", "sentiste", "sintió", "sentimos", "sintieron"],
    "future": ["sentiré", "sentirás", "sentirá", "sentiremos", "sentirán"]
  },
  "pensar": {
    "present": ["pienso", "pensás", "piensa", "pensamos", "piensan"],
    "past": ["pensé", "pensaste", "pensó", "pensamos", "pensaron"],
    "future": ["pensaré", "pensarás", "pensará", "pensaremos", "pensarán"]
  },
  "encontrar": {
    "present": [
      "encuentro",
      "encontrás",
      "encuentra",
      "encontramos",
      "encuentran"
    ],
    "past": [
      "encontré",
      "encontraste",
      "encontró",
      "encontramos",
      "encontraron"
    ],
    "future": [
      "encontraré",
      "encontrarás",
      "encontrará",
      "encontraremos",
      "encontrarán"
    ]
  },
  "empezar": {
    "present": ["empiezo", "empezás", "empieza", "empezamos", "empiezan"],
    "past": ["empecé", "empezaste", "empezó", "empezamos", "empezaron"],
    "future": ["empezaré", "empezarás", "empezará", "empezaremos", "empezarán"]
  },
};

const List<String> VERB_LIST = [
  "hablar",
  "comer",
  "vivir",
  "ser",
  "estar",
  "tener",
  "ir",
  "hacer",
  "decir",
  "poder",
  "querer",
  "saber",
  "dar",
  "ver",
  "venir",
  "poner",
  "salir",
  "dormir",
  "pedir",
  "sentir",
  "pensar",
  "encontrar",
  "empezar",
  "seguir",
  "trabajar",
  "estudiar",
  "comprar",
  "necesitar",
  "buscar",
  "llamar",
  "llegar",
  "tomar",
  "ayudar",
  "caminar",
  "correr",
  "abrir",
  "cerrar",
  "esperar",
  "explicar",
  "enseñar",
  "usar",
  "cambiar",
  "terminar",
  "ganar",
  "perder"
];

String conjugate(String verb, String tense, int subjIdx) {
  if (IRREG[verb] != null && IRREG[verb]![tense] != null) {
    return IRREG[verb]![tense]![subjIdx];
  }
  final type = verb.endsWith("ar")
      ? "ar"
      : verb.endsWith("er")
          ? "er"
          : "ir";
  final stem = verb.substring(0, verb.length - 2);
  final table = type == "ar"
      ? _regAr
      : type == "er"
          ? _regEr
          : _regIr;
  if (tense == "future") {
    return verb + table[tense]![subjIdx].substring(type.length);
  }
  return stem + table[tense]![subjIdx];
}

// ══════════════════════════════════════════════
// DECAY ENGINE
// ══════════════════════════════════════════════
const double _HL = 24;
double cM(int exp, int lastMs) {
  if (exp == 0) return 0;
  final h = (DateTime.now().millisecondsSinceEpoch - lastMs) / 3600000.0;
  final hl = _HL * sqrt(exp);
  final m = pow(2, -h / hl) * min(1.0, exp / 5.0);
  return m.clamp(0.0, 1.0).toDouble();
}

Color mC(double m) => m >= .8
    ? T.teal
    : m >= .5
        ? T.gold
        : m >= .2
            ? T.coral
            : Colors.transparent;
String mL(double m) => m >= .8
    ? "Strong"
    : m >= .5
        ? "Growing"
        : m >= .2
            ? "Fading"
            : "New";

final _punct = RegExp('[¿¡.,;:!?"\'()\u00AB\u00BB\u2018\u2019\u201C\u201D-]');
String clean(String w) => w.toLowerCase().replaceAll(_punct, '');

List<Map<String, dynamic>> tokenize(String text) {
  final r = RegExp(r'([a-záéíóúüñ¿¡]+|[^a-záéíóúüñ¿¡]+)', caseSensitive: false);
  return r.allMatches(text).map((m) {
    final raw = m.group(1)!;
    return {
      "raw": raw,
      "isW": RegExp(r'[a-záéíóúüñ]', caseSensitive: false).hasMatch(raw),
      "lo": raw.toLowerCase()
    };
  }).toList();
}

// ══════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════
class Store {
  static SharedPreferences? _p;
  static Future<void> init() async {
    _p = await SharedPreferences.getInstance();
  }

  static Map<String, dynamic> vocab() {
    final s = _p?.getString('fl_v4');
    return s == null ? {} : Map<String, dynamic>.from(jsonDecode(s));
  }

  static void saveVocab(Map<String, dynamic> v) =>
      _p?.setString('fl_v4', jsonEncode(v));
  static Map<String, dynamic> prog() {
    final s = _p?.getString('fl_p4');
    return s == null
        ? {
            "lookups": 0,
            "storiesRead": [],
            "practiceScore": 0,
            "practiceTotal": 0,
            "verbsCorrect": 0,
            "verbsTotal": 0
          }
        : Map<String, dynamic>.from(jsonDecode(s));
  }

  static void saveProg(Map<String, dynamic> p) =>
      _p?.setString('fl_p4', jsonEncode(p));
  static List<String> patterns() => _p?.getStringList('fl_pat1') ?? [];
  static void savePatterns(List<String> p) => _p?.setStringList('fl_pat1', p);

  // ── Raw key/value helpers used by the Content service ──
  static String? raw(String key) => _p?.getString(key);
  static void saveRaw(String key, String value) => _p?.setString(key, value);
  static int? rawInt(String key) => _p?.getInt(key);
  static void saveRawInt(String key, int value) => _p?.setInt(key, value);
  static void removeRaw(String key) => _p?.remove(key);

  // ── Daily goal / streak ──
  // Stored: last active date (yyyy-mm-dd), current streak, today's activity count, daily goal.
  static String _todayStr() {
    final n = DateTime.now();
    return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  static int dailyGoal() => _p?.getInt('fl_goal') ?? 20;
  static void setDailyGoal(int g) => _p?.setInt('fl_goal', g);
  static int streak() => _p?.getInt('fl_streak') ?? 0;
  static String? lastActive() => _p?.getString('fl_lastactive');
  static int todayCount() {
    if (lastActive() != _todayStr()) return 0;
    return _p?.getInt('fl_todaycount') ?? 0;
  }

  // Call whenever the user does a "reps" worth of activity (read a sentence, answer a drill).
  static void recordActivity([int reps = 1]) {
    final today = _todayStr();
    final last = lastActive();
    if (last != today) {
      // New day. Update streak based on whether yesterday was the last active day.
      final y = DateTime.now().subtract(const Duration(days: 1));
      final yStr =
          '${y.year}-${y.month.toString().padLeft(2, '0')}-${y.day.toString().padLeft(2, '0')}';
      final cur = streak();
      _p?.setInt('fl_streak', last == yStr ? cur + 1 : 1);
      _p?.setString('fl_lastactive', today);
      _p?.setInt('fl_todaycount', reps);
    } else {
      _p?.setInt('fl_todaycount', (todayCount()) + reps);
    }
  }
}

// ══════════════════════════════════════════════
// FLUENCY SCORE
// ══════════════════════════════════════════════
class Fluency {
  int overall = 0;
  String level = "A0", levelDesc = "Absolute beginner";
  double vocabScore = 0,
      practiceAcc = 0,
      storyScore = 0,
      patternScore = 0,
      verbScore = 0;
  List<Map<String, String>> milestones = [];
  List<Map<String, dynamic>> next = [];
  int known = 0, strong = 0;
}

Fluency calcFluency(
    Map<String, dynamic> vocab, Map<String, dynamic> prog, List<String> upats) {
  final f = Fluency();
  int known = 0, strong = 0;
  vocab.forEach((k, v) {
    final m = cM(v['exposures'] ?? 0, v['lastSeen'] ?? 0);
    if (m >= .2) known++;
    if (m >= .8) strong++;
  });
  f.known = known;
  f.strong = strong;
  f.vocabScore = min(1.0, known / 300.0);
  final pt = prog['practiceTotal'] ?? 0;
  f.practiceAcc = pt > 0 ? (prog['practiceScore'] ?? 0) / pt : 0;
  final sr = (prog['storiesRead'] as List?)?.length ?? 0;
  f.storyScore = min(1.0, sr / STORIES.length);
  f.patternScore = min(1.0, upats.length / PATTERNS.length);
  f.verbScore = min(1.0, (prog['verbsCorrect'] ?? 0) / 50.0);
  final overall = f.vocabScore * .35 +
      f.practiceAcc * .2 +
      f.storyScore * .15 +
      f.patternScore * .15 +
      f.verbScore * .15;
  f.overall = (overall * 100).round();
  if (overall >= .85) {
    f.level = "B1";
    f.levelDesc = "Intermediate — can handle daily life";
  } else if (overall >= .65) {
    f.level = "A2+";
    f.levelDesc = "Strong beginner — surviving independently";
  } else if (overall >= .45) {
    f.level = "A2";
    f.levelDesc = "Basic — can handle simple situations";
  } else if (overall >= .25) {
    f.level = "A1+";
    f.levelDesc = "Building — recognizing patterns";
  } else if (overall >= .1) {
    f.level = "A1";
    f.levelDesc = "Starter — learning core words";
  }

  void ms(bool c, String t, String d) {
    if (c) f.milestones.add({"t": t, "d": d});
  }

  ms(known >= 10, "First 10 words", "You know 10 Spanish words!");
  ms(known >= 50, "50 words", "You cover ~30% of basic conversation");
  ms(known >= 100, "100 words", "You can handle simple situations");
  ms(known >= 200, "200 words", "You understand most everyday speech");
  ms(known >= 300, "300 words", "You can survive independently in Nicaragua");
  ms(strong >= 50, "50 words locked in", "These words aren't going anywhere");
  ms(sr >= 6, "Phase 0 complete", "All beginner stories read");
  ms(sr >= STORIES.length, "All stories read",
      "You've read every story in the app");
  ms(upats.length >= 3, "Pattern spotter", "3 grammar patterns discovered");
  ms((prog['verbsCorrect'] ?? 0) >= 20, "Verb master",
      "20 conjugations nailed");

  if (known < 50)
    f.next.add({
      "t": "50 words",
      "d": "${50 - known} more to go",
      "pct": known / 50.0
    });
  else if (known < 100)
    f.next.add({
      "t": "100 words",
      "d": "${100 - known} more to go",
      "pct": known / 100.0
    });
  else if (known < 200)
    f.next.add({
      "t": "200 words",
      "d": "${200 - known} more to go",
      "pct": known / 200.0
    });
  else if (known < 300)
    f.next.add({
      "t": "300 words",
      "d": "${300 - known} more to go",
      "pct": known / 300.0
    });
  return f;
}

// ══════════════════════════════════════════════
// EXERCISE GENERATOR
// ══════════════════════════════════════════════
class Exercise {
  String type;
  String? word, correct, english, sentence, trans, spanish;
  List<String>? opts;
  Exercise(this.type,
      {this.word,
      this.correct,
      this.english,
      this.sentence,
      this.trans,
      this.spanish,
      this.opts});
}

final _rng = Random();
List<Exercise> genExercises(Map<String, dynamic> vocab, [int count = 12]) {
  final ex = <Exercise>[];
  final dw = D.entries
      .where((e) =>
          !["prep", "art", "conj", "contr", "pron"].contains(e.value.pos))
      .toList();
  final review = vocab.entries
      .where((e) => D[e.key] != null && (e.value['exposures'] ?? 0) >= 1)
      .map((e) => {
            "word": e.key,
            "m": cM(e.value['exposures'] ?? 0, e.value['lastSeen'] ?? 0)
          })
      .toList()
    ..sort((a, b) => (a['m'] as double).compareTo(b['m'] as double));
  final rev = review.take(30).toList();
  final sents = STORIES.expand((s) => s.sn).toList();

  for (int i = 0; i < count; i++) {
    final t = i % 4;
    if (t == 0 && rev.isNotEmpty) {
      final tgt = rev[i % rev.length]['word'] as String;
      final cor = D[tgt]?.en.split("/")[0].trim();
      if (cor == null) continue;
      final wrongs = (dw.where((e) => e.key != tgt).toList()..shuffle())
          .take(3)
          .map((e) => e.value.en.split("/")[0].trim())
          .toList();
      ex.add(Exercise("es_en",
          word: tgt, correct: cor, opts: [cor, ...wrongs]..shuffle()));
    } else if (t == 1 && rev.isNotEmpty) {
      final tgt = rev[(i + 3) % rev.length]['word'] as String;
      final en = D[tgt]?.en.split("/")[0].trim();
      if (en == null) continue;
      final wrongs = (dw.where((e) => e.key != tgt).toList()..shuffle())
          .take(3)
          .map((e) => e.key)
          .toList();
      ex.add(Exercise("en_es",
          english: en, correct: tgt, opts: [tgt, ...wrongs]..shuffle()));
    } else if (t == 2 && sents.isNotEmpty) {
      final sn = sents[_rng.nextInt(sents.length)];
      final tk = tokenize(sn.s)
          .where((t) => t["isW"] == true && D[t["lo"]] != null)
          .toList();
      if (tk.length < 2) continue;
      final tgt = tk[_rng.nextInt(tk.length)];
      final cor = tgt["lo"] as String;
      final wrongs = (dw.where((e) => e.key != cor).toList()..shuffle())
          .take(3)
          .map((e) => e.key)
          .toList();
      final gp = sn.s.replaceFirst(tgt["raw"] as String, "______");
      ex.add(Exercise("gap",
          sentence: gp,
          trans: sn.e,
          correct: cor,
          opts: [cor, ...wrongs]..shuffle()));
    } else if (sents.isNotEmpty) {
      final sn = sents[_rng.nextInt(sents.length)];
      ex.add(Exercise("tr", english: sn.e, spanish: sn.s));
    }
  }
  return ex.isEmpty
      ? [
          Exercise("tr",
              english: "Hello, how are you?", spanish: "Hola, ¿cómo estás?")
        ]
      : ex;
}

// ══════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════
class FluidezApp extends StatelessWidget {
  const FluidezApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Fluidez',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark().copyWith(scaffoldBackgroundColor: T.bg),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic> vocab = {};
  Map<String, dynamic> prog = {};
  List<String> upats = [];
  bool loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await Store.init();
    await Content.init();
    setState(() {
      vocab = Store.vocab();
      prog = Store.prog();
      upats = Store.patterns();
      loaded = true;
      _checkPatterns();
    });
    // After the UI is up, refresh from the network in the background:
    // pull the language list, then the selected language's content. This is
    // what makes new/updated lessons appear automatically on launch.
    () async {
      try {
        await Content.fetchLanguages();
        await Content.checkForUpdates();
        if (mounted) setState(() {});
      } catch (_) {}
    }();
  }

  void _checkPatterns() {
    for (final p in PATTERNS) {
      if (upats.contains(p.id)) continue;
      final seen = p.trigger
          .where(
              (w) => vocab[w] != null && (vocab[w]['exposures'] ?? 0) >= p.min)
          .length;
      if (seen >= p.min) upats.add(p.id);
    }
    Store.savePatterns(upats);
  }

  // Language picker — lists languages from the registry and switches on tap.
  void _showLanguagePicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: T.sf,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Choose a language',
                style: TextStyle(
                    color: T.txt, fontSize: 18, fontWeight: FontWeight.w700))),
        ...Content.languages.map((lang) {
          final code = lang["code"].toString();
          final isSel = code == Content.selectedLangCode;
          return ListTile(
            leading: Text((lang["flag"] ?? "🌐").toString(),
                style: const TextStyle(fontSize: 24)),
            title: Text((lang["name"] ?? code).toString(),
                style: TextStyle(
                    color: T.txt,
                    fontWeight: isSel ? FontWeight.w700 : FontWeight.w400)),
            trailing: isSel ? const Icon(Icons.check, color: T.gold) : null,
            onTap: () async {
              Navigator.pop(ctx);
              if (isSel) return;
              setState(() => loaded = false);
              await Content.switchLanguage(code);
              await Content.checkForUpdates();
              if (!mounted) return;
              setState(() {
                vocab = Store.vocab();
                prog = Store.prog();
                loaded = true;
              });
            },
          );
        }),
        const SizedBox(height: 8),
      ])),
    );
  }

  void refresh() => setState(() {
        vocab = Store.vocab();
        prog = Store.prog();
        upats = Store.patterns();
        _checkPatterns();
      });

  @override
  Widget build(BuildContext context) {
    if (!loaded)
      return const Scaffold(
          body: Center(child: CircularProgressIndicator(color: T.gold)));
    final f = calcFluency(vocab, prog, upats);
    int fading = 0;
    vocab.forEach((k, v) {
      final m = cM(v['exposures'] ?? 0, v['lastSeen'] ?? 0);
      if (m >= .2 && m < .5) fading++;
    });
    final sr = (prog['storiesRead'] as List?) ?? [];

    return Scaffold(
      body: SafeArea(
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                ShaderMask(
                                    shaderCallback: (b) => const LinearGradient(
                                            colors: [T.gold, T.coral])
                                        .createShader(b),
                                    child: const Text('Fluidez',
                                        style: TextStyle(
                                            fontSize: 28,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white))),
                                const SizedBox(height: 2),
                                GestureDetector(
                                  onTap: _showLanguagePicker,
                                  child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                            '${(Content.currentLanguage["flag"] ?? "").toString()} ${(Content.currentLanguage["name"] ?? "Language").toString().toUpperCase()}',
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: T.tm,
                                                letterSpacing: 1.2)),
                                        const SizedBox(width: 4),
                                        const Icon(Icons.expand_more,
                                            size: 14, color: T.tm),
                                      ]),
                                ),
                              ]),
                          GestureDetector(
                              onTap: () => _push(FluencyScreen(
                                  vocab: vocab, prog: prog, upats: upats)),
                              child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 14, vertical: 6),
                                  decoration: BoxDecoration(
                                      color: T.sf2,
                                      borderRadius: BorderRadius.circular(20)),
                                  child: Text('${f.level} · ${f.overall}%',
                                      style: const TextStyle(
                                          fontSize: 13,
                                          color: T.gold,
                                          fontWeight: FontWeight.w700)))),
                        ]),
                    const SizedBox(height: 16),
                    // Streak + daily goal
                    Builder(builder: (_) {
                      final streak = Store.streak();
                      final goal = Store.dailyGoal();
                      final today = Store.todayCount();
                      final pct =
                          goal > 0 ? (today / goal).clamp(0.0, 1.0) : 0.0;
                      final done = today >= goal;
                      return Container(
                          padding: const EdgeInsets.all(14),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                              color: T.sf,
                              borderRadius: BorderRadius.circular(12)),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(children: [
                                        Text(streak > 0 ? '🔥' : '☀️',
                                            style:
                                                const TextStyle(fontSize: 18)),
                                        const SizedBox(width: 8),
                                        Text(
                                            streak > 0
                                                ? '$streak-day streak'
                                                : 'Start your streak today',
                                            style: const TextStyle(
                                                fontSize: 14,
                                                color: T.txt,
                                                fontWeight: FontWeight.w600)),
                                      ]),
                                      Text(
                                          done
                                              ? '✓ Goal met'
                                              : '$today / $goal today',
                                          style: TextStyle(
                                              fontSize: 12,
                                              color: done ? T.teal : T.tm,
                                              fontWeight: FontWeight.w600)),
                                    ]),
                                const SizedBox(height: 8),
                                ClipRRect(
                                    borderRadius: BorderRadius.circular(2),
                                    child: LinearProgressIndicator(
                                        value: pct,
                                        backgroundColor: T.sf3,
                                        color: done ? T.teal : T.gold,
                                        minHeight: 5)),
                              ]));
                    }),
                    // Action buttons
                    Row(children: [
                      Expanded(
                          child: _actBtn(
                              f.known == 0
                                  ? '⚡ Practice'
                                  : fading > 3
                                      ? '⚡ $fading fading — Drill'
                                      : '⚡ Practice',
                              f.known == 0
                                  ? T.sf2
                                  : fading > 3
                                      ? T.coral
                                      : T.gold, () async {
                        if (f.known == 0) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                              content: Text(
                                  'Read a story first to build words to practice.')));
                          return;
                        }
                        await _push(PracticeScreen(vocab: vocab));
                        refresh();
                      })),
                      const SizedBox(width: 8),
                      Expanded(
                          child: _actBtn('🔄 Verb Trainer', T.indigo, () async {
                        await _push(const VerbScreen());
                        refresh();
                      })),
                    ]),
                    const SizedBox(height: 8),
                    SizedBox(
                        width: double.infinity,
                        child:
                            _actBtn('🧩 Word Order Trainer', T.teal, () async {
                          await _push(const OrderScreen());
                          refresh();
                        })),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                          child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: T.sf2,
                                  foregroundColor: T.txt,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8))),
                              onPressed: () async {
                                await _push(const LessonsScreen());
                                refresh();
                              },
                              child: const Text('📚 Lessons',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600)))),
                      const SizedBox(width: 8),
                      Expanded(
                          child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: T.sf2,
                                  foregroundColor: T.txt,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8))),
                              onPressed: () async {
                                await _push(const ScenariosScreen());
                                refresh();
                              },
                              child: const Text('💬 Scenarios',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600)))),
                    ]),
                    const SizedBox(height: 14),
                    // Next milestone
                    if (f.next.isNotEmpty)
                      Container(
                          padding: const EdgeInsets.all(12),
                          margin: const EdgeInsets.only(bottom: 14),
                          decoration: BoxDecoration(
                              color: T.sf,
                              borderRadius: BorderRadius.circular(12)),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('NEXT MILESTONE',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: T.tm,
                                        letterSpacing: 1)),
                                const SizedBox(height: 6),
                                Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(f.next[0]['t'],
                                          style: const TextStyle(
                                              fontSize: 13,
                                              color: T.txt,
                                              fontWeight: FontWeight.w600)),
                                      Text(f.next[0]['d'],
                                          style: const TextStyle(
                                              fontSize: 13, color: T.tm)),
                                    ]),
                                const SizedBox(height: 4),
                                ClipRRect(
                                    borderRadius: BorderRadius.circular(2),
                                    child: LinearProgressIndicator(
                                        value:
                                            (f.next[0]['pct'] ?? 0).toDouble(),
                                        backgroundColor: T.sf3,
                                        color: T.gold,
                                        minHeight: 4)),
                              ])),
                    // Patterns
                    if (upats.isNotEmpty) ...[
                      const Text('PATTERNS UNLOCKED',
                          style: TextStyle(
                              fontSize: 11, color: T.tm, letterSpacing: 1)),
                      const SizedBox(height: 6),
                      Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: PATTERNS
                              .where((p) => upats.contains(p.id))
                              .map((p) => GestureDetector(
                                  onTap: () => _push(
                                      PatternScreen(pattern: p, vocab: vocab)),
                                  child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                          color: T.sf,
                                          borderRadius:
                                              BorderRadius.circular(8),
                                          border: Border.all(
                                              color:
                                                  T.indigo.withOpacity(0.2))),
                                      child: Text(p.title,
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: T.indigo,
                                              fontWeight: FontWeight.w600)))))
                              .toList()),
                      const SizedBox(height: 14),
                    ],
                    // Stories
                    // Phases
                    Text('PHASES',
                        style: const TextStyle(
                            fontSize: 11, color: T.tm, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    ...phaseNumbers().map((ph) {
                      final lessonIds = phaseLessonIds(ph);
                      final readCount =
                          lessonIds.where((id) => sr.contains(id)).length;
                      final allRead =
                          lessonIds.isNotEmpty && readCount == lessonIds.length;
                      return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Material(
                              color: T.sf,
                              borderRadius: BorderRadius.circular(12),
                              child: InkWell(
                                  borderRadius: BorderRadius.circular(12),
                                  onTap: () async {
                                    await _push(PhaseScreen(phase: ph));
                                    refresh();
                                  },
                                  child: Container(
                                      padding: const EdgeInsets.all(14),
                                      decoration: BoxDecoration(
                                          border: Border(
                                              left: BorderSide(
                                                  color: allRead
                                                      ? T.teal
                                                      : readCount > 0
                                                          ? T.gold
                                                          : T.sf3,
                                                  width: 3))),
                                      child: Row(children: [
                                        Expanded(
                                            child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                              Text(
                                                  'Phase $ph — ${phaseName(ph)}',
                                                  style: const TextStyle(
                                                      fontSize: 14,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                      color: T.txt)),
                                              Text(phaseDesc(ph),
                                                  style: const TextStyle(
                                                      fontSize: 11,
                                                      color: T.tm)),
                                            ])),
                                        Text('$readCount/${lessonIds.length}',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: allRead ? T.teal : T.tm,
                                                fontWeight: FontWeight.w600)),
                                        const SizedBox(width: 6),
                                        const Text('›',
                                            style: TextStyle(
                                                fontSize: 18, color: T.dim)),
                                      ])))));
                    }),
                    const SizedBox(height: 14),
                    // Bottom nav
                    Row(children: [
                      _navBtn('📖', 'Vocabulary', '${f.known} words',
                          () => _push(VocabScreen(vocab: vocab))),
                      const SizedBox(width: 8),
                      _navBtn('📊', 'Fluency Map', 'Progress',
                          () => _push(MapScreen(vocab: vocab))),
                      const SizedBox(width: 8),
                      _navBtn(
                          '🏆',
                          'Milestones',
                          '${f.milestones.length} earned',
                          () => _push(FluencyScreen(
                              vocab: vocab, prog: prog, upats: upats))),
                    ]),
                  ]))),
    );
  }

  Future<void> _push(Widget w) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => w));

  Widget _actBtn(String label, Color bg, VoidCallback onTap) => ElevatedButton(
      style: ElevatedButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: T.w,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
      onPressed: onTap,
      child: Text(label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)));

  Widget _navBtn(String emoji, String title, String sub, VoidCallback onTap) =>
      Expanded(
          child: Material(
              color: T.sf,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: onTap,
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(children: [
                        Text(emoji, style: const TextStyle(fontSize: 16)),
                        Text(title,
                            style: const TextStyle(
                                fontSize: 11,
                                color: T.txt,
                                fontWeight: FontWeight.w600)),
                        Text(sub,
                            style: const TextStyle(fontSize: 10, color: T.tm)),
                      ])))));
}

// ── WORD DETAIL SHEET ──
void showWordSheet(BuildContext ctx, String word, Map<String, dynamic> vocab) {
  final c = clean(word);
  if (c.isEmpty) return;
  final entry = D[c];
  final vs = vocab[c];
  final m = vs != null ? cM(vs['exposures'] ?? 0, vs['lastSeen'] ?? 0) : 0.0;
  showModalBottomSheet(
      context: ctx,
      backgroundColor: T.sf,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => Padding(
          padding: EdgeInsets.fromLTRB(
              24, 12, 24, 24 + MediaQuery.of(sheetCtx).padding.bottom),
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                    child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                            color: T.sf3,
                            borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 16),
                Row(children: [
                  Text(c,
                      style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: T.txt)),
                  const SizedBox(width: 10),
                  GestureDetector(
                      onTap: () => Speech.speak(c),
                      child: const Icon(Icons.volume_up_rounded,
                          size: 22, color: T.gold)),
                  const SizedBox(width: 10),
                  if (entry?.g != null)
                    Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                            color: T.idc,
                            borderRadius: BorderRadius.circular(4)),
                        child: Text(entry!.g!,
                            style: const TextStyle(
                                fontSize: 12,
                                color: T.indigo,
                                fontWeight: FontWeight.w600))),
                  if (entry?.pos != null)
                    Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(entry!.pos,
                            style: const TextStyle(fontSize: 12, color: T.tm))),
                ]),
                const SizedBox(height: 6),
                if (entry != null) ...[
                  Text(entry.en,
                      style: const TextStyle(
                          fontSize: 18,
                          color: T.gold,
                          fontWeight: FontWeight.w600)),
                  if (entry.note != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                                color: T.sf2,
                                borderRadius: BorderRadius.circular(8)),
                            child: Text(entry.note!,
                                style: const TextStyle(
                                    fontSize: 14, color: T.tm, height: 1.5)))),
                  if (vs != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Row(children: [
                          Expanded(
                              child: ClipRRect(
                                  borderRadius: BorderRadius.circular(2),
                                  child: LinearProgressIndicator(
                                      value: m,
                                      backgroundColor: T.sf3,
                                      color: mC(m),
                                      minHeight: 4))),
                          const SizedBox(width: 10),
                          Text(mL(m).toUpperCase(),
                              style: TextStyle(
                                  fontSize: 11,
                                  color: mC(m),
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(width: 6),
                          Text('×${vs['exposures'] ?? 0}',
                              style:
                                  const TextStyle(fontSize: 11, color: T.dim)),
                        ])),
                ] else
                  const Text('Not in dictionary yet — logged.',
                      style: TextStyle(
                          fontSize: 14,
                          color: T.tm,
                          fontStyle: FontStyle.italic)),
              ])));
}

// Vocab logging helpers
void logExp(String w) {
  final c = clean(w);
  if (c.isEmpty) return;
  final v = Store.vocab();
  final ex = v[c] ??
      {
        "exposures": 0,
        "lookups": 0,
        "lastSeen": DateTime.now().millisecondsSinceEpoch
      };
  ex['exposures'] = (ex['exposures'] ?? 0) + 1;
  ex['lastSeen'] = DateTime.now().millisecondsSinceEpoch;
  v[c] = ex;
  Store.saveVocab(v);
}

void logLookup(String w) {
  logExp(w);
  final c = clean(w);
  if (c.isEmpty) return;
  final v = Store.vocab();
  v[c]['lookups'] = (v[c]['lookups'] ?? 0) + 1;
  Store.saveVocab(v);
  final p = Store.prog();
  p['lookups'] = (p['lookups'] ?? 0) + 1;
  Store.saveProg(p);
}

// ══════════════════════════════════════════════
// READER SCREEN
// ══════════════════════════════════════════════
class ReaderScreen extends StatefulWidget {
  final Story story;
  const ReaderScreen({super.key, required this.story});
  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  bool inWarmup = true;
  int wuStep = 0;
  bool wuRev = false;
  Set<int> revealed = {};

  @override
  void initState() {
    super.initState();
    final p = Store.prog();
    final read = List<String>.from(p['storiesRead'] ?? []);
    if (!read.contains(widget.story.id)) {
      read.add(widget.story.id);
      p['storiesRead'] = read;
      Store.saveProg(p);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ww = widget.story.wu;
    return Scaffold(
      backgroundColor: inWarmup ? T.bg : T.rd,
      appBar: AppBar(
        backgroundColor: T.sf,
        elevation: 0,
        iconTheme: const IconThemeData(color: T.tm),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.story.title,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
          Text(inWarmup ? 'Vocab warm-up' : 'Tap sentences for English',
              style: const TextStyle(fontSize: 11, color: T.tm)),
        ]),
        actions: inWarmup
            ? [
                Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Center(
                        child: Text('${wuStep + 1}/${ww.length}',
                            style: const TextStyle(
                                fontSize: 12,
                                color: T.gold,
                                fontWeight: FontWeight.w600))))
              ]
            : null,
      ),
      body: SafeArea(top: false, child: inWarmup ? _warmup(ww) : _reader()),
    );
  }

  Widget _warmup(List<String> ww) {
    final cw = ww[wuStep];
    final ce = D[cw];
    return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          const Text('Learn these words before reading. Tap to reveal.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: T.tm)),
          const SizedBox(height: 16),
          Expanded(
              child: GestureDetector(
                  onTap: () => setState(() => wuRev = true),
                  child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                          color: T.sf,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: T.sf3)),
                      child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(cw,
                                style: const TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w700,
                                    color: T.txt)),
                            if (ce?.pos != null)
                              Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                      ce!.pos +
                                          (ce.g != null ? ' · ${ce.g}' : ''),
                                      style: const TextStyle(
                                          fontSize: 11, color: T.tm))),
                            const SizedBox(height: 14),
                            if (!wuRev)
                              const Text('Tap to reveal',
                                  style: TextStyle(fontSize: 12, color: T.dim))
                            else
                              Column(children: [
                                Text(ce?.en ?? '—',
                                    style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.w600,
                                        color: T.gold)),
                                if (ce?.note != null)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 10),
                                      child: Container(
                                          constraints: const BoxConstraints(
                                              maxWidth: 280),
                                          padding: const EdgeInsets.all(10),
                                          decoration: BoxDecoration(
                                              color: T.sf2,
                                              borderRadius:
                                                  BorderRadius.circular(8)),
                                          child: Text(ce!.note!,
                                              style: const TextStyle(
                                                  fontSize: 11,
                                                  color: T.tm,
                                                  height: 1.5)))),
                              ]),
                          ])))),
          const SizedBox(height: 14),
          Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                  ww.length,
                  (i) => Container(
                      width: 7,
                      height: 7,
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: i < wuStep
                              ? T.teal
                              : i == wuStep
                                  ? T.gold
                                  : T.sf3)))),
          const SizedBox(height: 14),
          if (wuRev)
            SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                        backgroundColor:
                            wuStep < ww.length - 1 ? T.sf2 : T.gold,
                        foregroundColor: T.w,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8))),
                    onPressed: () {
                      logExp(cw);
                      setState(() {
                        if (wuStep < ww.length - 1) {
                          wuStep++;
                          wuRev = false;
                        } else
                          inWarmup = false;
                      });
                    },
                    child: Text(
                        wuStep < ww.length - 1
                            ? 'Next Word →'
                            : 'Start Reading →',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)))),
        ]));
  }

  Widget _reader() {
    return Column(children: [
      Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 14),
          color: T.gd,
          child: const Text(
              'Tap a sentence for English. Tap any word for its definition.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 11,
                  color: Color(0xFFB8860B),
                  fontWeight: FontWeight.w500))),
      Expanded(
          child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 80),
              itemCount: widget.story.sn.length + 1,
              itemBuilder: (ctx, i) {
                if (i == widget.story.sn.length)
                  return Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Row(children: [
                        Expanded(
                            child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFE8DCC8),
                                    foregroundColor: T.rt,
                                    shape: RoundedRectangleBorder(
                                        borderRadius:
                                            BorderRadius.circular(8))),
                                onPressed: () => setState(() => revealed =
                                    Set.from(List.generate(
                                        widget.story.sn.length, (j) => j))),
                                child: const Text('Show All',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w600)))),
                        const SizedBox(width: 8),
                        Expanded(
                            child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFE8DCC8),
                                    foregroundColor: T.rt,
                                    shape: RoundedRectangleBorder(
                                        borderRadius:
                                            BorderRadius.circular(8))),
                                onPressed: () =>
                                    setState(() => revealed.clear()),
                                child: const Text('Hide All',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w600)))),
                      ]));
                final sn = widget.story.sn[i];
                final isR = revealed.contains(i);
                return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                                child: GestureDetector(
                                    onTap: () => setState(() {
                                          isR
                                              ? revealed.remove(i)
                                              : revealed.add(i);
                                        }),
                                    child: Container(
                                        padding: EdgeInsets.only(
                                            left: isR ? 10 : 0,
                                            top: 3,
                                            bottom: 3),
                                        decoration: BoxDecoration(
                                            border: Border(
                                                left: BorderSide(
                                                    color: isR
                                                        ? T.gold
                                                        : Colors.transparent,
                                                    width: 3))),
                                        child: Wrap(
                                            children: tokenize(sn.s).map((t) {
                                          if (t["isW"] != true)
                                            return Text(t["raw"] as String,
                                                style: const TextStyle(
                                                    fontSize: 16,
                                                    height: 1.7,
                                                    color: T.rt,
                                                    fontFamily: 'Georgia'));
                                          final hasDef = D[t["lo"]] != null;
                                          return GestureDetector(
                                              onTap: () => showWordSheet(
                                                  context,
                                                  t["raw"] as String,
                                                  Store.vocab()),
                                              child: Text(t["raw"] as String,
                                                  style: TextStyle(
                                                      fontSize: 16,
                                                      height: 1.7,
                                                      color: T.rt,
                                                      fontFamily: 'Georgia',
                                                      decoration: hasDef
                                                          ? TextDecoration
                                                              .underline
                                                          : TextDecoration.none,
                                                      decorationStyle:
                                                          TextDecorationStyle
                                                              .dotted,
                                                      decorationColor: T.rm
                                                          .withOpacity(0.4))));
                                        }).toList())))),
                            GestureDetector(
                                onTap: () => Speech.speak(sn.s),
                                child: Padding(
                                    padding:
                                        const EdgeInsets.only(left: 6, top: 4),
                                    child: Icon(Icons.volume_up_rounded,
                                        size: 20,
                                        color: T.rm.withOpacity(0.6)))),
                          ]),
                      if (isR)
                        Container(
                            padding: const EdgeInsets.only(
                                left: 13, top: 1, bottom: 5),
                            decoration: const BoxDecoration(
                                border: Border(
                                    left: BorderSide(color: T.gold, width: 3))),
                            child: Text(sn.e,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: T.rm,
                                    fontStyle: FontStyle.italic,
                                    height: 1.5))),
                    ]);
              })),
    ]);
  }
}

// ══════════════════════════════════════════════
// PRACTICE SCREEN
// ══════════════════════════════════════════════
class PracticeScreen extends StatefulWidget {
  final Map<String, dynamic> vocab;
  const PracticeScreen({super.key, required this.vocab});
  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> {
  late List<Exercise> exs;
  int idx = 0, score = 0;
  String? ans;
  bool rev = false, done = false;

  @override
  void initState() {
    super.initState();
    exs = genExercises(widget.vocab, 12);
  }

  void _finish() {
    final p = Store.prog();
    p['practiceScore'] = (p['practiceScore'] ?? 0) + score;
    p['practiceTotal'] = (p['practiceTotal'] ?? 0) + exs.length;
    Store.saveProg(p);
    setState(() => done = true);
  }

  @override
  Widget build(BuildContext context) {
    if (done) {
      final pct = exs.isNotEmpty ? (score / exs.length * 100).round() : 0;
      return Scaffold(
          body: Center(
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(
                        pct >= 80
                            ? "🔥"
                            : pct >= 50
                                ? "💪"
                                : "📚",
                        style: const TextStyle(fontSize: 48)),
                    const SizedBox(height: 12),
                    const Text('Session Complete',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: T.txt)),
                    Text('$pct%',
                        style: TextStyle(
                            fontSize: 40,
                            fontWeight: FontWeight.w700,
                            color: pct >= 80
                                ? T.teal
                                : pct >= 50
                                    ? T.gold
                                    : T.coral)),
                    Text('$score/${exs.length} correct',
                        style: const TextStyle(fontSize: 14, color: T.tm)),
                    const SizedBox(height: 24),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.gold,
                                foregroundColor: T.w,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => setState(() {
                                  exs = genExercises(Store.vocab(), 12);
                                  idx = 0;
                                  score = 0;
                                  ans = null;
                                  rev = false;
                                  done = false;
                                }),
                            child: const Text('Practice Again'))),
                    const SizedBox(height: 8),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.sf,
                                foregroundColor: T.tm,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Home'))),
                  ]))));
    }
    final ex = exs[idx];
    final isLast = idx >= exs.length - 1;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: T.sf,
        elevation: 0,
        iconTheme: const IconThemeData(color: T.tm),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Practice',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
          Text('${idx + 1} of ${exs.length}',
              style: const TextStyle(fontSize: 11, color: T.tm)),
        ]),
        actions: [
          Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                  child: Text('$score',
                      style: const TextStyle(
                          fontSize: 13,
                          color: T.gold,
                          fontWeight: FontWeight.w600))))
        ],
        bottom: PreferredSize(
            preferredSize: const Size.fromHeight(3),
            child: LinearProgressIndicator(
                value: (idx + 1) / exs.length,
                backgroundColor: T.sf3,
                color: T.gold,
                minHeight: 3)),
      ),
      body: SafeArea(
          top: false,
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        ex.type == "es_en"
                            ? "WHAT DOES THIS MEAN?"
                            : ex.type == "en_es"
                                ? "HOW DO YOU SAY THIS?"
                                : ex.type == "gap"
                                    ? "FILL THE GAP"
                                    : "TRANSLATE",
                        style: const TextStyle(
                            fontSize: 11, color: T.tm, letterSpacing: 1)),
                    const SizedBox(height: 12),
                    if (ex.type == "es_en")
                      Text(ex.word!,
                          style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              color: T.txt)),
                    if (ex.type == "en_es")
                      Text(ex.english!,
                          style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              color: T.gold)),
                    if (ex.type == "gap") ...[
                      Text(ex.sentence!,
                          style: const TextStyle(
                              fontSize: 17,
                              color: T.txt,
                              height: 1.6,
                              fontFamily: 'Georgia')),
                      const SizedBox(height: 6),
                      Text(ex.trans!,
                          style: const TextStyle(
                              fontSize: 12,
                              color: T.tm,
                              fontStyle: FontStyle.italic)),
                    ],
                    if (ex.type == "tr")
                      Text(ex.english!,
                          style: const TextStyle(
                              fontSize: 17,
                              color: T.gold,
                              height: 1.6,
                              fontWeight: FontWeight.w600)),
                    const SizedBox(height: 20),
                    if (ex.opts != null)
                      ...ex.opts!.map((o) {
                        final isC = o == ex.correct, isS = ans == o;
                        Color bg = T.sf, bd = T.sf3;
                        if (ans != null) {
                          if (isC) {
                            bg = T.td;
                            bd = T.teal;
                          } else if (isS) {
                            bg = T.cd;
                            bd = T.coral;
                          }
                        }
                        return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: GestureDetector(
                                onTap: ans != null
                                    ? null
                                    : () {
                                        setState(() {
                                          ans = o;
                                          if (o == ex.correct) {
                                            score++;
                                            logExp(ex.correct ?? ex.word!);
                                          }
                                        });
                                        Store.recordActivity();
                                      },
                                child: Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14, vertical: 12),
                                    decoration: BoxDecoration(
                                        color: bg,
                                        border: Border.all(color: bd, width: 2),
                                        borderRadius:
                                            BorderRadius.circular(12)),
                                    child: Row(children: [
                                      Expanded(
                                          child: Text(o,
                                              style: const TextStyle(
                                                  fontSize: 15,
                                                  color: T.txt,
                                                  fontWeight:
                                                      FontWeight.w500))),
                                      if (ans != null && isC)
                                        const Text('✓',
                                            style: TextStyle(color: T.teal)),
                                      if (isS && !isC)
                                        const Text('✗',
                                            style: TextStyle(color: T.coral))
                                    ]))));
                      }),
                    if (ex.type == "tr") ...[
                      if (!rev)
                        SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                    backgroundColor: T.sf2,
                                    foregroundColor: T.txt,
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 14)),
                                onPressed: () => setState(() => rev = true),
                                child: const Text('Reveal Spanish')))
                      else ...[
                        Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                                color: T.sf,
                                borderRadius: BorderRadius.circular(12),
                                border: const Border(
                                    left: BorderSide(color: T.gold, width: 3))),
                            child: Text(ex.spanish!,
                                style: const TextStyle(
                                    fontSize: 17,
                                    color: T.txt,
                                    fontFamily: 'Georgia',
                                    height: 1.6))),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(
                              child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: T.td,
                                      foregroundColor: T.teal,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14)),
                                  onPressed: ans != null
                                      ? null
                                      : () {
                                          setState(() {
                                            score++;
                                            ans = "y";
                                          });
                                          for (final t
                                              in tokenize(ex.spanish!)) {
                                            if (t["isW"] == true)
                                              logExp(t["raw"] as String);
                                          }
                                        },
                                  child: const Text('Got it ✓'))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: T.cd,
                                      foregroundColor: T.coral,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14)),
                                  onPressed: ans != null
                                      ? null
                                      : () => setState(() => ans = "n"),
                                  child: const Text('Not yet ✗'))),
                        ]),
                      ],
                    ],
                    if (ans != null)
                      Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: T.gold,
                                      foregroundColor: T.w,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14)),
                                  onPressed: () {
                                    if (isLast)
                                      _finish();
                                    else
                                      setState(() {
                                        idx++;
                                        ans = null;
                                        rev = false;
                                      });
                                  },
                                  child: Text(
                                      isLast ? 'See Results' : 'Next →')))),
                  ]))),
    );
  }
}

// ══════════════════════════════════════════════
// VERB TRAINER SCREEN
// ══════════════════════════════════════════════
class VerbScreen extends StatefulWidget {
  const VerbScreen({super.key});
  @override
  State<VerbScreen> createState() => _VerbScreenState();
}

class _VerbScreenState extends State<VerbScreen> {
  final _rng = Random();
  late String verb;
  int subj = 0, score = 0, total = 0, round = 0;
  late List<String> opts;
  String? ans;
  bool done = false;

  @override
  void initState() {
    super.initState();
    _next();
  }

  void _next() {
    verb = VERB_LIST[_rng.nextInt(VERB_LIST.length)];
    subj = _rng.nextInt(5);
    final correct = conjugate(verb, "present", subj);
    final wrongs = <String>[];
    while (wrongs.length < 3) {
      final wv = VERB_LIST[_rng.nextInt(VERB_LIST.length)];
      final wc = conjugate(wv, "present", subj);
      if (wc != correct && !wrongs.contains(wc)) wrongs.add(wc);
    }
    opts = [correct, ...wrongs]..shuffle();
    ans = null;
  }

  @override
  Widget build(BuildContext context) {
    if (done) {
      final pct = total > 0 ? (score / total * 100).round() : 0;
      return Scaffold(
          body: Center(
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text("🔄", style: TextStyle(fontSize: 48)),
                    const SizedBox(height: 12),
                    const Text('Verbs Complete',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: T.txt)),
                    Text('$pct%',
                        style: TextStyle(
                            fontSize: 40,
                            fontWeight: FontWeight.w700,
                            color: pct >= 80
                                ? T.teal
                                : pct >= 50
                                    ? T.gold
                                    : T.coral)),
                    Text('$score/$total correct',
                        style: const TextStyle(fontSize: 14, color: T.tm)),
                    const SizedBox(height: 24),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.indigo,
                                foregroundColor: T.w,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => setState(() {
                                  score = 0;
                                  total = 0;
                                  round = 0;
                                  done = false;
                                  _next();
                                }),
                            child: const Text('Train Again'))),
                    const SizedBox(height: 8),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.sf,
                                foregroundColor: T.tm,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Home'))),
                  ]))));
    }
    final correct = conjugate(verb, "present", subj);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: T.sf,
        elevation: 0,
        iconTheme: const IconThemeData(color: T.tm),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Verb Trainer',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
          Text('Round ${round + 1} of 10',
              style: const TextStyle(fontSize: 11, color: T.tm)),
        ]),
        actions: [
          Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                  child: Text('$score/$total',
                      style: const TextStyle(
                          fontSize: 13,
                          color: T.indigo,
                          fontWeight: FontWeight.w600))))
        ],
        bottom: PreferredSize(
            preferredSize: const Size.fromHeight(3),
            child: LinearProgressIndicator(
                value: (round + 1) / 10,
                backgroundColor: T.sf3,
                color: T.indigo,
                minHeight: 3)),
      ),
      body: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
              24, 24, 24, 24 + MediaQuery.of(context).padding.bottom),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CONJUGATE · PRESENT TENSE',
                style: TextStyle(fontSize: 11, color: T.tm, letterSpacing: 1)),
            const SizedBox(height: 16),
            Center(
                child: Column(children: [
              Text(SUBJECTS[subj],
                  style: const TextStyle(fontSize: 16, color: T.tm)),
              Text(verb,
                  style: const TextStyle(
                      fontSize: 32, fontWeight: FontWeight.w700, color: T.txt)),
              Text(D[verb]?.en ?? '',
                  style: const TextStyle(fontSize: 13, color: T.tm)),
            ])),
            const SizedBox(height: 24),
            ...opts.map((o) {
              final isC = o == correct, isS = ans == o;
              Color bg = T.sf, bd = T.sf3;
              if (ans != null) {
                if (isC) {
                  bg = T.td;
                  bd = T.teal;
                } else if (isS) {
                  bg = T.cd;
                  bd = T.coral;
                }
              }
              return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: GestureDetector(
                      onTap: ans != null
                          ? null
                          : () {
                              setState(() {
                                ans = o;
                                total++;
                              });
                              final p = Store.prog();
                              p['verbsTotal'] = (p['verbsTotal'] ?? 0) + 1;
                              if (o == correct) {
                                setState(() => score++);
                                p['verbsCorrect'] =
                                    (p['verbsCorrect'] ?? 0) + 1;
                              }
                              Store.saveProg(p);
                              Store.recordActivity();
                            },
                      child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 14),
                          decoration: BoxDecoration(
                              color: bg,
                              border: Border.all(color: bd, width: 2),
                              borderRadius: BorderRadius.circular(12)),
                          child: Row(children: [
                            Expanded(
                                child: Text(o,
                                    style: const TextStyle(
                                        fontSize: 16,
                                        color: T.txt,
                                        fontWeight: FontWeight.w500))),
                            if (ans != null && isC)
                              const Text('✓', style: TextStyle(color: T.teal)),
                            if (isS && !isC)
                              const Text('✗', style: TextStyle(color: T.coral))
                          ]))));
            }),
            if (ans != null)
              Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: T.indigo,
                              foregroundColor: T.w,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14)),
                          onPressed: () {
                            if (round >= 9)
                              setState(() => done = true);
                            else
                              setState(() {
                                round++;
                                _next();
                              });
                          },
                          child: Text(round >= 9 ? 'See Results' : 'Next →')))),
          ])),
    );
  }
}

// ══════════════════════════════════════════════
// FLUENCY / MILESTONES SCREEN
// ══════════════════════════════════════════════
class FluencyScreen extends StatelessWidget {
  final Map<String, dynamic> vocab, prog;
  final List<String> upats;
  const FluencyScreen(
      {super.key,
      required this.vocab,
      required this.prog,
      required this.upats});

  @override
  Widget build(BuildContext context) {
    final f = calcFluency(vocab, prog, upats);
    final sr = (prog['storiesRead'] as List?)?.length ?? 0;
    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title: const Text('Your Fluency',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt))),
      body: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
              20, 20, 20, 20 + MediaQuery.of(context).padding.bottom),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(
                child: Column(children: [
              Text('${f.overall}%',
                  style: const TextStyle(
                      fontSize: 64,
                      fontWeight: FontWeight.w700,
                      color: T.gold)),
              Text(f.level,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700, color: T.txt)),
              Text(f.levelDesc,
                  style: const TextStyle(fontSize: 14, color: T.tm),
                  textAlign: TextAlign.center),
            ])),
            const SizedBox(height: 24),
            Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    color: T.sf, borderRadius: BorderRadius.circular(12)),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('SCORE BREAKDOWN',
                          style: TextStyle(
                              fontSize: 12, color: T.tm, letterSpacing: 1)),
                      const SizedBox(height: 12),
                      ..._bar(
                          "Vocabulary (35%)", f.vocabScore, "${f.known} words"),
                      ..._bar("Practice (20%)", f.practiceAcc,
                          "${(f.practiceAcc * 100).round()}% accuracy"),
                      ..._bar("Stories (15%)", f.storyScore,
                          "$sr/${STORIES.length}"),
                      ..._bar("Grammar (15%)", f.patternScore,
                          "${upats.length}/${PATTERNS.length}"),
                      ..._bar("Verbs (15%)", f.verbScore,
                          "${prog['verbsCorrect'] ?? 0} done"),
                    ])),
            const SizedBox(height: 16),
            if (f.milestones.isNotEmpty) ...[
              Text('MILESTONES EARNED · ${f.milestones.length}',
                  style: const TextStyle(
                      fontSize: 12, color: T.tm, letterSpacing: 1)),
              const SizedBox(height: 8),
              ...f.milestones.map((m) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                      color: T.sf,
                      borderRadius: BorderRadius.circular(8),
                      border: const Border(
                          left: BorderSide(color: T.gold, width: 3))),
                  child: Row(children: [
                    const Text('🏆', style: TextStyle(fontSize: 18)),
                    const SizedBox(width: 10),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(m['t']!,
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: T.txt)),
                          Text(m['d']!,
                              style:
                                  const TextStyle(fontSize: 11, color: T.tm)),
                        ]))
                  ]))),
            ],
            if (f.next.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Text('NEXT GOAL',
                  style:
                      TextStyle(fontSize: 12, color: T.tm, letterSpacing: 1)),
              const SizedBox(height: 8),
              ...f.next.map((n) => Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                      color: T.sf, borderRadius: BorderRadius.circular(8)),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(n['t'],
                                  style: const TextStyle(
                                      fontSize: 13,
                                      color: T.txt,
                                      fontWeight: FontWeight.w600)),
                              Text(n['d'],
                                  style: const TextStyle(
                                      fontSize: 13, color: T.tm)),
                            ]),
                        const SizedBox(height: 4),
                        ClipRRect(
                            borderRadius: BorderRadius.circular(2),
                            child: LinearProgressIndicator(
                                value: (n['pct'] ?? 0).toDouble(),
                                backgroundColor: T.sf3,
                                color: T.teal,
                                minHeight: 4)),
                      ]))),
            ],
          ])),
    );
  }

  List<Widget> _bar(String label, double v, String d) => [
        Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 12,
                        color: T.txt,
                        fontWeight: FontWeight.w500)),
                Text(d, style: const TextStyle(fontSize: 12, color: T.tm)),
              ]),
              const SizedBox(height: 3),
              ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                      value: v,
                      backgroundColor: T.sf3,
                      color: T.gold,
                      minHeight: 4)),
            ])),
      ];
}

// ══════════════════════════════════════════════
// PATTERN SCREEN
// ══════════════════════════════════════════════
class PatternScreen extends StatelessWidget {
  final Pattern pattern;
  final Map<String, dynamic> vocab;
  const PatternScreen({super.key, required this.pattern, required this.vocab});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title: const Text('Grammar Pattern',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt))),
      body: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
              20, 20, 20, 20 + MediaQuery.of(context).padding.bottom),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
                decoration: BoxDecoration(
                    color: T.idc, borderRadius: BorderRadius.circular(12)),
                child: const Text('PATTERN UNLOCKED',
                    style: TextStyle(
                        fontSize: 11,
                        color: T.indigo,
                        fontWeight: FontWeight.w600))),
            const SizedBox(height: 10),
            Text(pattern.title,
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700, color: T.txt)),
            const SizedBox(height: 14),
            Text(pattern.text,
                style: const TextStyle(fontSize: 14, color: T.tm, height: 1.7)),
            const SizedBox(height: 16),
            const Text('WORDS YOU\'VE SEEN',
                style: TextStyle(fontSize: 11, color: T.dim, letterSpacing: 1)),
            const SizedBox(height: 6),
            Wrap(
                spacing: 6,
                runSpacing: 6,
                children: pattern.trigger
                    .where((w) => vocab[w] != null)
                    .map((w) => GestureDetector(
                        onTap: () => showWordSheet(context, w, vocab),
                        child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                                color: T.sf,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                    color: T.indigo.withOpacity(0.2))),
                            child: Text('$w  ${D[w]?.en.split("/")[0] ?? ""}',
                                style: const TextStyle(
                                    fontSize: 12, color: T.txt)))))
                    .toList()),
          ])),
    );
  }
}

// ══════════════════════════════════════════════
// VOCAB SCREEN
// ══════════════════════════════════════════════
class VocabScreen extends StatefulWidget {
  final Map<String, dynamic> vocab;
  const VocabScreen({super.key, required this.vocab});
  @override
  State<VocabScreen> createState() => _VocabScreenState();
}

class _VocabScreenState extends State<VocabScreen> {
  String query = '';
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vocab = widget.vocab;
    final q = query.trim().toLowerCase();
    int known = 0;
    vocab.forEach((k, v) {
      if (cM(v['exposures'] ?? 0, v['lastSeen'] ?? 0) >= .2) known++;
    });

    Widget body;
    if (q.isNotEmpty) {
      // SEARCH MODE — search the whole dictionary (Spanish word or English meaning)
      final matches = D.entries
          .where((e) =>
              e.key.toLowerCase().contains(q) ||
              e.value.en.toLowerCase().contains(q))
          .take(80)
          .toList();
      body = matches.isEmpty
          ? const Center(
              child: Padding(
                  padding: EdgeInsets.all(40),
                  child: Text('No matches.', style: TextStyle(color: T.tm))))
          : ListView(
              padding: EdgeInsets.fromLTRB(
                  20, 12, 20, 20 + MediaQuery.of(context).padding.bottom),
              children: matches.map((e) {
                final vs = vocab[e.key];
                final m = vs != null
                    ? cM(vs['exposures'] ?? 0, vs['lastSeen'] ?? 0)
                    : 0.0;
                return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: GestureDetector(
                        onTap: () => showWordSheet(context, e.key, vocab),
                        child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                                color: T.sf,
                                borderRadius: BorderRadius.circular(10),
                                border: Border(
                                    left: BorderSide(
                                        color: m > 0 ? mC(m) : T.sf3,
                                        width: 3))),
                            child: Row(children: [
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(e.key,
                                        style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w600,
                                            color: T.txt)),
                                    Text(e.value.en,
                                        style: const TextStyle(
                                            fontSize: 12, color: T.tm)),
                                  ])),
                              if (e.value.g != null)
                                Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 1),
                                    decoration: BoxDecoration(
                                        color: T.idc,
                                        borderRadius: BorderRadius.circular(4)),
                                    child: Text(e.value.g!,
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: T.indigo,
                                            fontWeight: FontWeight.w600))),
                              GestureDetector(
                                  onTap: () => Speech.speak(e.key),
                                  child: const Padding(
                                      padding: EdgeInsets.only(left: 8),
                                      child: Icon(Icons.volume_up_rounded,
                                          size: 18, color: T.gold))),
                            ]))));
              }).toList());
    } else if (vocab.isEmpty) {
      body = const Center(
          child: Text('Read a story to start, or search the dictionary above.',
              style: TextStyle(color: T.tm), textAlign: TextAlign.center));
    } else {
      // GROUPED MODE — your words by mastery
      final levels = ['Strong', 'Growing', 'Fading', 'New'];
      final grouped = <String, List<MapEntry<String, dynamic>>>{
        for (var l in levels) l: []
      };
      vocab.forEach((w, v) {
        if (D[w] == null) return;
        final m = cM(v['exposures'] ?? 0, v['lastSeen'] ?? 0);
        grouped[mL(m)]!.add(MapEntry(w, v));
      });
      body = ListView(
          padding: EdgeInsets.fromLTRB(
              20, 12, 20, 20 + MediaQuery.of(context).padding.bottom),
          children: levels.map((level) {
            final words = grouped[level]!
              ..sort((a, b) => cM(
                      b.value['exposures'] ?? 0, b.value['lastSeen'] ?? 0)
                  .compareTo(
                      cM(a.value['exposures'] ?? 0, a.value['lastSeen'] ?? 0)));
            if (words.isEmpty) return const SizedBox.shrink();
            final c = level == 'Strong'
                ? T.teal
                : level == 'Growing'
                    ? T.gold
                    : level == 'Fading'
                        ? T.coral
                        : T.dim;
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                        width: 7,
                        height: 7,
                        decoration:
                            BoxDecoration(shape: BoxShape.circle, color: c)),
                    const SizedBox(width: 6),
                    Text('${level.toUpperCase()} · ${words.length}',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: c))
                  ]),
                  const SizedBox(height: 6),
                  Wrap(
                      spacing: 5,
                      runSpacing: 5,
                      children: words
                          .map((e) => GestureDetector(
                              onTap: () => showWordSheet(context, e.key, vocab),
                              child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                      color: T.sf,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                          color: c.withOpacity(0.2))),
                                  child: Text(
                                      '${e.key}  ${D[e.key]?.en.split("/")[0].trim() ?? ""}',
                                      style: const TextStyle(
                                          fontSize: 12, color: T.txt)))))
                          .toList()),
                  const SizedBox(height: 18),
                ]);
          }).toList());
    }

    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Vocabulary',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
            Text('$known words known',
                style: const TextStyle(fontSize: 11, color: T.tm)),
          ])),
      body: SafeArea(
          top: false,
          child: Column(children: [
            // Search bar
            Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: TextField(
                    controller: _ctrl,
                    onChanged: (v) => setState(() => query = v),
                    style: const TextStyle(color: T.txt, fontSize: 15),
                    decoration: InputDecoration(
                      hintText: 'Search Spanish or English…',
                      hintStyle: const TextStyle(color: T.dim),
                      prefixIcon:
                          const Icon(Icons.search, color: T.tm, size: 20),
                      suffixIcon: query.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear,
                                  color: T.tm, size: 18),
                              onPressed: () {
                                _ctrl.clear();
                                setState(() => query = '');
                              })
                          : null,
                      filled: true,
                      fillColor: T.sf,
                      contentPadding: const EdgeInsets.symmetric(vertical: 0),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide.none),
                    ))),
            if (q.isNotEmpty)
              Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Searching full dictionary',
                          style: TextStyle(fontSize: 11, color: T.dim)))),
            Expanded(child: body),
          ])),
    );
  }
}

// ══════════════════════════════════════════════
// FLUENCY MAP SCREEN
// ══════════════════════════════════════════════
class MapScreen extends StatelessWidget {
  final Map<String, dynamic> vocab;
  const MapScreen({super.key, required this.vocab});

  @override
  Widget build(BuildContext context) {
    final slang = [
      "dale",
      "ideay",
      "tuani",
      "chele",
      "chavalo",
      "pinolero",
      "fritanga",
      "pues",
      "mirá",
      "andá",
      "decime",
      "nica",
      "plata",
      "reales",
      "tomá",
      "pasá",
      "pulpería",
      "nacatamal",
      "vigorón",
      "tajadas"
    ];
    final voseo = [
      "vos",
      "sos",
      "tenés",
      "querés",
      "sabés",
      "podés",
      "venís",
      "hacés",
      "decís",
      "mirá",
      "andá",
      "tomá",
      "pasá",
      "esperá",
      "vení",
      "comé",
      "sentate",
      "bajás",
      "necesitás",
      "entendés"
    ];
    final cats = [
      {"l": "Verbs", "f": (String w) => D[w]?.pos.contains("v") ?? false},
      {"l": "Nouns", "f": (String w) => D[w]?.pos == "n"},
      {"l": "Adjectives", "f": (String w) => D[w]?.pos == "adj"},
      {"l": "Nica Slang", "f": (String w) => slang.contains(w)},
      {"l": "Voseo", "f": (String w) => voseo.contains(w)},
    ];
    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title: const Text('Fluency Map',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt))),
      body: ListView(
          padding: EdgeInsets.fromLTRB(
              20, 20, 20, 20 + MediaQuery.of(context).padding.bottom),
          children: [
            ...cats.map((cat) {
              final f = cat["f"] as bool Function(String);
              final all = D.keys.where(f).toList();
              final seen = all
                  .where((w) =>
                      vocab[w] != null &&
                      cM(vocab[w]['exposures'] ?? 0,
                              vocab[w]['lastSeen'] ?? 0) >=
                          .2)
                  .length;
              final pct =
                  all.isNotEmpty ? (seen / all.length * 100).round() : 0;
              return Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: T.sf, borderRadius: BorderRadius.circular(12)),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(cat["l"] as String,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: T.txt)),
                              Text('$seen/${all.length} · $pct%',
                                  style: const TextStyle(
                                      fontSize: 11, color: T.tm)),
                            ]),
                        const SizedBox(height: 6),
                        Wrap(
                            spacing: 2,
                            runSpacing: 2,
                            children: all.take(50).map((w) {
                              final v = vocab[w];
                              final m = v != null
                                  ? cM(v['exposures'] ?? 0, v['lastSeen'] ?? 0)
                                  : 0.0;
                              return Container(
                                  width: 11,
                                  height: 11,
                                  decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(2),
                                      color: m >= .8
                                          ? T.teal
                                          : m >= .5
                                              ? T.gold
                                              : m >= .2
                                                  ? T.coral
                                                  : T.sf3.withOpacity(0.3)));
                            }).toList()),
                        const SizedBox(height: 6),
                        ClipRRect(
                            borderRadius: BorderRadius.circular(2),
                            child: LinearProgressIndicator(
                                value: pct / 100,
                                backgroundColor: T.sf3,
                                color: T.teal,
                                minHeight: 3)),
                      ]));
            }),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _legend(T.sf3, "Unseen"),
              const SizedBox(width: 12),
              _legend(T.coral, "Fading"),
              const SizedBox(width: 12),
              _legend(T.gold, "Growing"),
              const SizedBox(width: 12),
              _legend(T.teal, "Strong"),
            ]),
          ]),
    );
  }

  Widget _legend(Color c, String l) => Row(children: [
        Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2), color: c)),
        const SizedBox(width: 3),
        Text(l, style: const TextStyle(fontSize: 10, color: T.tm)),
      ]);
}

// ══════════════════════════════════════════════════════════
// CONTENT SERVICE — fetches lessons/dictionary from GitHub,
// caches locally, manages downloads + update checks.
// ══════════════════════════════════════════════════════════
//
// Content source is selected at runtime from the language registry.
//
// Expected repo layout:
//   /content/manifest.json
//   /content/dictionary/*.json
//   /content/lessons/*.json
//   /content/patterns/*.json
//
// This file is APPENDED to main.dart. It assumes these already exist
// in main.dart: class E, class Sn, class Story, class Pattern, class Store
// (SharedPreferences wrapper), and the bundled* seed data.

// ── URLS / LANGUAGE SOURCE ──
//
// The app supports multiple languages, each living in its own content repo.
// A tiny registry repo (fluidez-languages) holds languages.json, which lists
// every available language and the repo its content lives in. The app reads
// that list, lets the user pick, and points content fetching at the chosen
// language's repo.
//
// languages.json lives here:
const String _registryUser = "scenicprints";
const String _registryRepo = "fluidez-languages";
const String _registryBranch = "main";
String get _languagesUrl =>
    "https://raw.githubusercontent.com/$_registryUser/$_registryRepo/$_registryBranch/languages.json";

// Built-in fallback language, used if the registry can't be reached, so the
// app always works even offline / before the picker has ever been opened.
const Map<String, String> _fallbackLang = {
  "code": "es-ni",
  "name": "Nicaraguan Spanish",
  "flag": "🇳🇮",
  "user": "scenicprints",
  "repo": "fluidez-es-ni",
  "branch": "main",
};

// The currently selected language's GitHub coordinates. These are set at
// startup (from saved choice or fallback) and whenever the user switches.
String _ghUser = _fallbackLang["user"]!;
String _ghRepo = _fallbackLang["repo"]!;
String _ghBranch = _fallbackLang["branch"]!;

// Content fetching uses these — they update live when the language changes.
String get _rawBase =>
    "https://raw.githubusercontent.com/$_ghUser/$_ghRepo/$_ghBranch";
String get _apiBase => "https://api.github.com/repos/$_ghUser/$_ghRepo";

// Apply a language map (as found in languages.json) as the active source.
void _applyLanguage(Map<String, dynamic> lang) {
  _ghUser = (lang["user"] ?? _fallbackLang["user"]).toString();
  _ghRepo = (lang["repo"] ?? _fallbackLang["repo"]).toString();
  _ghBranch = (lang["branch"] ?? _fallbackLang["branch"]).toString();
}

// ── MANIFEST MODEL ──
// manifest.json shape:
// {
//   "dictionary": ["dictionary/core.json", "dictionary/slang.json"],
//   "patterns":   ["patterns/voseo.json"],
//   "lessons": [
//     {"id":"s01","title":"...","desc":"...","phase":0,"diff":1,"path":"lessons/s01.json"}
//   ]
// }
class ManifestLesson {
  final String id, title, desc, path;
  final int phase, diff;
  ManifestLesson(
      {required this.id,
      required this.title,
      required this.desc,
      required this.path,
      required this.phase,
      required this.diff});
  factory ManifestLesson.fromJson(Map<String, dynamic> j) => ManifestLesson(
        id: j['id'] ?? '',
        title: j['title'] ?? 'Untitled',
        desc: j['desc'] ?? '',
        path: j['path'] ?? '',
        phase: j['phase'] is int
            ? j['phase'] as int
            : int.tryParse('${j['phase']}') ?? 0,
        diff: j['diff'] is int
            ? j['diff'] as int
            : int.tryParse('${j['diff']}') ?? 1,
      );
}

class Manifest {
  final List<String> dictionaryFiles;
  final List<String> patternFiles;
  final List<ManifestLesson> lessons;
  final List<ManifestLesson>
      scenarios; // reuse same shape (id,title,desc,phase,path)
  Manifest(
      {required this.dictionaryFiles,
      required this.patternFiles,
      required this.lessons,
      required this.scenarios});
  factory Manifest.fromJson(Map<String, dynamic> j) => Manifest(
        dictionaryFiles:
            (j['dictionary'] as List?)?.map((e) => e.toString()).toList() ?? [],
        patternFiles:
            (j['patterns'] as List?)?.map((e) => e.toString()).toList() ?? [],
        lessons: (j['lessons'] as List?)
                ?.map((e) =>
                    ManifestLesson.fromJson(Map<String, dynamic>.from(e)))
                .toList() ??
            [],
        scenarios: (j['scenarios'] as List?)
                ?.map((e) =>
                    ManifestLesson.fromJson(Map<String, dynamic>.from(e)))
                .toList() ??
            [],
      );
}

// ── DOWNLOAD STATE for a lesson ──
enum DlState { notDownloaded, downloaded, outOfDate }

// ══════════════════════════════════════════════════════════
// ContentService — static, no instance needed
// ══════════════════════════════════════════════════════════
class Content {
  // Runtime, mutable. Seeded from bundled data, augmented by fetched content.
  static Map<String, E> dict = {};
  static List<Story> stories = [];
  static List<Pattern> patterns = [];
  static List<Scenario> scenarios = [];
  static Manifest? manifest;

  // ── SharedPreferences keys ──
  static const _kManifest = 'ct_manifest'; // cached manifest JSON
  static const _kDictCache = 'ct_dict'; // cached merged dictionary JSON
  static const _kLessonPrefix = 'ct_lesson_'; // + id  -> cached lesson JSON
  static const _kLessonDate =
      'ct_lessondate_'; // + id  -> download timestamp (ms)
  static const _kLessonRemoteDate =
      'ct_remotedate_'; // + id -> last-known remote commit ms
  static const _kContentVer = 'ct_contentver'; // last-seen content version
  static const _kLangCode = 'ct_langcode'; // selected language code
  static const _kLangList = 'ct_langlist'; // cached languages.json

  // Available languages (from languages.json); always has at least the fallback.
  static List<Map<String, dynamic>> languages = [
    Map<String, dynamic>.from(_fallbackLang)
  ];
  static String selectedLangCode = _fallbackLang["code"]!;

  // Bump this number whenever lesson/scenario CONTENT changes on GitHub,
  // OR when switching the content source (e.g. a new repo). When the app sees
  // a newer number than it last stored, it clears every saved lesson/scenario
  // so they re-download fresh instead of showing an old saved copy.
  static const int contentVersion = 3;

  // ──────────────────────────────────────────────
  // INIT — called at app startup. Loads from cache/bundle. NO network.
  // ──────────────────────────────────────────────
  static Future<void> init() async {
    // 0. Restore the language list + selected language from cache (offline-safe).
    final cachedLangs = Store.raw(_kLangList);
    if (cachedLangs != null) {
      try {
        final decoded = jsonDecode(cachedLangs);
        final list = (decoded is Map ? decoded['languages'] : decoded) as List;
        languages = list.map((e) => Map<String, dynamic>.from(e)).toList();
      } catch (_) {}
    }
    final savedCode = Store.raw(_kLangCode);
    if (savedCode != null) selectedLangCode = savedCode;
    // Point the content source at the selected language (or fallback).
    final active = languages.firstWhere(
      (l) => l["code"] == selectedLangCode,
      orElse: () => Map<String, dynamic>.from(_fallbackLang),
    );
    _applyLanguage(active);

    // 1. Seed from bundled data (always present, guarantees a working app)
    dict = Map<String, E>.from(bundledD);
    stories = List<Story>.from(bundledStories);
    patterns = List<Pattern>.from(bundledPatterns);
    scenarios = [];

    // 2. Layer cached dictionary on top (if we fetched one before)
    final cachedDict = Store.raw(_kDictCache);
    if (cachedDict != null) {
      try {
        _mergeDictFromJson(cachedDict);
      } catch (_) {}
    }

    // 3. Load cached manifest (so the lesson list shows offline)
    final cachedManifest = Store.raw(_kManifest);
    if (cachedManifest != null) {
      try {
        manifest = Manifest.fromJson(jsonDecode(cachedManifest));
      } catch (_) {}
    }

    // 4. Layer any downloaded lessons on top of the bundled stories
    if (manifest != null) {
      for (final ml in manifest!.lessons) {
        final cached = Store.raw(_kLessonPrefix + ml.id);
        if (cached != null) {
          try {
            final st = _storyFromJson(jsonDecode(cached));
            _upsertStory(st);
          } catch (_) {}
        }
      }
      // 5. Load any downloaded scenarios
      for (final ms in manifest!.scenarios) {
        final cached = Store.raw(_kLessonPrefix + 'scn_' + ms.id);
        if (cached != null) {
          try {
            _upsertScenario(_scenarioFromJson(jsonDecode(cached)));
          } catch (_) {}
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // LANGUAGES — fetch the registry list; switch the active language.
  // ──────────────────────────────────────────────

  // Fetch languages.json from the registry repo. Falls back silently to the
  // cached list (or the built-in fallback) if the network is unavailable.
  static Future<void> fetchLanguages() async {
    try {
      final s = await _httpGet(_languagesUrl);
      final decoded = jsonDecode(s);
      final list = (decoded is Map ? decoded['languages'] : decoded) as List;
      final parsed = list.map((e) => Map<String, dynamic>.from(e)).toList();
      if (parsed.isNotEmpty) {
        languages = parsed;
        Store.saveRaw(_kLangList, s);
        // If our selected code no longer exists, fall back to the first one.
        if (!languages.any((l) => l["code"] == selectedLangCode)) {
          await switchLanguage(languages.first["code"].toString());
        }
      }
    } catch (_) {
      // Keep whatever we already have (cached list or fallback).
    }
  }

  // Switch the active language: repoint the source, clear cached content so
  // the new language loads fresh, and remember the choice.
  static Future<void> switchLanguage(String code) async {
    final lang = languages.firstWhere(
      (l) => l["code"] == code,
      orElse: () => Map<String, dynamic>.from(_fallbackLang),
    );
    selectedLangCode = code;
    Store.saveRaw(_kLangCode, code);
    _applyLanguage(lang);

    // Clear everything tied to the previous language so nothing bleeds over.
    if (manifest != null) {
      for (final ml in manifest!.lessons) {
        Store.removeRaw(_kLessonPrefix + ml.id);
        Store.removeRaw(_kLessonDate + ml.id);
        Store.removeRaw(_kLessonRemoteDate + ml.id);
      }
      for (final ms in manifest!.scenarios) {
        Store.removeRaw(_kLessonPrefix + 'scn_' + ms.id);
      }
    }
    Store.removeRaw(_kManifest);
    Store.removeRaw(_kDictCache);
    manifest = null;
    stories = List<Story>.from(bundledStories);
    scenarios = [];
    dict = Map<String, E>.from(bundledD);
  }

  // The display info for the currently selected language.
  static Map<String, dynamic> get currentLanguage => languages.firstWhere(
        (l) => l["code"] == selectedLangCode,
        orElse: () => Map<String, dynamic>.from(_fallbackLang),
      );
  static Future<String> checkForUpdates() async {
    // 1. Fetch manifest (raw, not API — doesn't count against API limit)
    String manifestStr;
    try {
      manifestStr = await _httpGet('$_rawBase/content/manifest.json');
    } catch (e) {
      return 'Could not reach the content server. Check your connection.';
    }
    Manifest m;
    try {
      final decoded = jsonDecode(manifestStr);
      m = Manifest.fromJson(Map<String, dynamic>.from(decoded));
    } catch (e) {
      return 'Content index error: ${e.toString().length > 60 ? e.toString().substring(0, 60) : e}';
    }
    manifest = m;
    Store.saveRaw(_kManifest, manifestStr);

    // 1b. CONTENT VERSION CHECK — if the app's content version is newer than
    //     what we last stored, the lesson/scenario text has changed even though
    //     IDs stayed the same. Clear every saved lesson & scenario so they
    //     re-fetch fresh instead of serving an old saved copy.
    final lastVer = Store.rawInt(_kContentVer) ?? 0;
    if (contentVersion > lastVer) {
      for (final ml in m.lessons) {
        Store.removeRaw(_kLessonPrefix + ml.id);
        Store.removeRaw(_kLessonDate + ml.id);
        Store.removeRaw(_kLessonRemoteDate + ml.id);
      }
      for (final ms in m.scenarios) {
        Store.removeRaw(_kLessonPrefix + 'scn_' + ms.id);
      }
      // Also drop the stale copies held in memory since startup, so the
      // reader re-fetches fresh from GitHub instead of showing the old text.
      stories.clear();
      scenarios.clear();
      Store.saveRawInt(_kContentVer, contentVersion);
    }

    // 2. Fetch + merge all dictionary files (raw). Always refresh dict.
    int dictCount = 0;
    final mergedDict = <String, dynamic>{};
    for (final df in m.dictionaryFiles) {
      try {
        final s = await _httpGet('$_rawBase/content/$df');
        final parsed = jsonDecode(s);
        if (parsed is Map) {
          parsed.forEach((k, v) => mergedDict[k.toString()] = v);
          dictCount++;
        }
      } catch (_) {/* skip a bad dict file, keep going */}
    }
    if (mergedDict.isNotEmpty) {
      final mergedStr = jsonEncode(mergedDict);
      Store.saveRaw(_kDictCache, mergedStr);
      _mergeDictFromJson(mergedStr);
    }

    // 3. Fetch + merge pattern files (raw)
    final fetchedPatterns = <Pattern>[];
    for (final pf in m.patternFiles) {
      try {
        final s = await _httpGet('$_rawBase/content/$pf');
        final parsed = jsonDecode(s);
        if (parsed is List) {
          for (final p in parsed) {
            fetchedPatterns.add(_patternFromJson(Map<String, dynamic>.from(p)));
          }
        } else if (parsed is Map) {
          fetchedPatterns
              .add(_patternFromJson(Map<String, dynamic>.from(parsed)));
        }
      } catch (_) {}
    }
    if (fetchedPatterns.isNotEmpty) {
      // Replace patterns: bundled + fetched, fetched wins on id collision
      final byId = <String, Pattern>{for (final p in bundledPatterns) p.id: p};
      for (final p in fetchedPatterns) {
        byId[p.id] = p;
      }
      patterns = byId.values.toList();
    }

    // 4. For each DOWNLOADED lesson, check the API for its last commit date.
    //    This is the only part that uses the rate-limited API.
    int staleCount = 0, apiChecks = 0;
    for (final ml in m.lessons) {
      final localDate = Store.rawInt(_kLessonDate + ml.id);
      if (localDate == null) continue; // not downloaded, nothing to compare
      try {
        final commitMs = await _lastCommitMs(ml.path);
        apiChecks++;
        if (commitMs != null) {
          Store.saveRawInt(_kLessonRemoteDate + ml.id, commitMs);
          if (commitMs > localDate) staleCount++;
        }
      } catch (_) {/* API may rate-limit; just skip */}
    }

    return 'Updated. ${m.lessons.length} lessons available'
        '${staleCount > 0 ? ', $staleCount need re-downloading' : ''}.';
  }

  // ──────────────────────────────────────────────
  // OPEN A LESSON — returns a Story, fetching if online & not cached.
  // Throws if offline and not downloaded.
  // ──────────────────────────────────────────────
  static Future<Story> openLesson(ManifestLesson ml) async {
    // If we have it cached, use the cache (fast, offline-friendly).
    final cached = Store.raw(_kLessonPrefix + ml.id);
    if (cached != null) {
      try {
        return _storyFromJson(jsonDecode(cached));
      } catch (_) {}
    }
    // Otherwise fetch from GitHub (requires connection).
    final s = await _httpGet('$_rawBase/content/${ml.path}');
    final story = _storyFromJson(jsonDecode(s));
    // Note: opening does NOT auto-save. Saving = downloading (explicit).
    _upsertStory(story);
    return story;
  }

  // ── OPEN A SCENARIO (fetch from GitHub; cached if downloaded) ──
  static Future<Scenario> openScenario(ManifestLesson ml) async {
    final cached = Store.raw(_kLessonPrefix + 'scn_' + ml.id);
    if (cached != null) {
      try {
        return _scenarioFromJson(jsonDecode(cached));
      } catch (_) {}
    }
    final s = await _httpGet('$_rawBase/content/${ml.path}');
    final scn = _scenarioFromJson(jsonDecode(s));
    _upsertScenario(scn);
    return scn;
  }

  static Future<void> downloadScenario(ManifestLesson ml) async {
    final s = await _httpGet('$_rawBase/content/${ml.path}');
    final scn = _scenarioFromJson(jsonDecode(s));
    Store.saveRaw(_kLessonPrefix + 'scn_' + ml.id, s);
    Store.saveRawInt(
        _kLessonDate + 'scn_' + ml.id, DateTime.now().millisecondsSinceEpoch);
    _upsertScenario(scn);
  }

  static bool isScenarioDownloaded(String id) =>
      Store.rawInt(_kLessonDate + 'scn_' + id) != null;
  static void removeScenarioDownload(String id) {
    Store.removeRaw(_kLessonPrefix + 'scn_' + id);
    Store.removeRaw(_kLessonDate + 'scn_' + id);
  }

  static void _upsertScenario(Scenario s) {
    final i = scenarios.indexWhere((x) => x.id == s.id);
    if (i >= 0) {
      scenarios[i] = s;
    } else {
      scenarios.add(s);
    }
  }

  static Scenario _scenarioFromJson(dynamic j) {
    final m = Map<String, dynamic>.from(j);
    final steps = (m['steps'] as List? ?? []).map((e) {
      final sm = Map<String, dynamic>.from(e);
      final opts = (sm['options'] as List? ?? []).map((o) {
        final om = Map<String, dynamic>.from(o);
        return ScenarioOption(
          es: (om['es'] ?? '').toString(),
          en: (om['en'] ?? '').toString(),
          feedback: (om['feedback'] ?? '').toString(),
          verdict: (om['verdict'] ?? 'ok').toString(),
        );
      }).toList();
      return ScenarioStep(
        speaker: (sm['speaker'] ?? '').toString(),
        promptEs: (sm['es'] ?? sm['promptEs'] ?? '').toString(),
        promptEn: (sm['en'] ?? sm['promptEn'] ?? '').toString(),
        options: opts,
      );
    }).toList();
    return Scenario(
      id: (m['id'] ?? '').toString(),
      title: (m['title'] ?? 'Untitled').toString(),
      desc: (m['desc'] ?? '').toString(),
      setting: (m['setting'] ?? '').toString(),
      ph: (m['ph'] ?? m['phase'] ?? 0) is int
          ? (m['ph'] ?? m['phase'] ?? 0)
          : int.tryParse('${m['ph'] ?? m['phase']}') ?? 0,
      steps: steps,
    );
  }

  // ──────────────────────────────────────────────
  // DOWNLOAD a lesson for offline use (saves to device + records date).
  // ──────────────────────────────────────────────
  static Future<void> downloadLesson(ManifestLesson ml) async {
    final s = await _httpGet('$_rawBase/content/${ml.path}');
    // Validate it parses before saving
    final story = _storyFromJson(jsonDecode(s));
    Store.saveRaw(_kLessonPrefix + ml.id, s);
    Store.saveRawInt(
        _kLessonDate + ml.id, DateTime.now().millisecondsSinceEpoch);
    // Record remote commit date now so it isn't immediately "stale"
    try {
      final commitMs = await _lastCommitMs(ml.path);
      if (commitMs != null)
        Store.saveRawInt(_kLessonRemoteDate + ml.id, commitMs);
    } catch (_) {}
    _upsertStory(story);
  }

  // ── DELETE a download (keeps progress; only removes the local copy) ──
  static void removeDownload(String id) {
    Store.removeRaw(_kLessonPrefix + id);
    Store.removeRaw(_kLessonDate + id);
    Store.removeRaw(_kLessonRemoteDate + id);
  }

  // ── STATE of a lesson for the UI ──
  static DlState lessonState(String id) {
    final localDate = Store.rawInt(_kLessonDate + id);
    if (localDate == null) return DlState.notDownloaded;
    final remoteDate = Store.rawInt(_kLessonRemoteDate + id);
    if (remoteDate != null && remoteDate > localDate) return DlState.outOfDate;
    return DlState.downloaded;
  }

  static bool isDownloaded(String id) =>
      Store.rawInt(_kLessonDate + id) != null;

  // ══════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════

  static Future<String> _httpGet(String url) async {
    // Append a unique cache-busting parameter so neither the CDN nor any
    // intermediate cache can serve a stale copy — every fetch is forced fresh.
    final bust = DateTime.now().millisecondsSinceEpoch;
    final sep = url.contains('?') ? '&' : '?';
    final resp = await httpGet(Uri.parse('$url${sep}cb=$bust'));
    if (resp.statusCode != 200) {
      throw Exception('HTTP ${resp.statusCode} for $url');
    }
    // Decode the raw bytes as UTF-8 explicitly (GitHub doesn't always declare
    // the charset, which can corrupt accented characters via resp.body).
    String body;
    try {
      body = utf8.decode(resp.bodyBytes);
    } catch (_) {
      body = resp.body;
    }
    // Strip a leading BOM and surrounding whitespace that can break jsonDecode.
    if (body.isNotEmpty && body.codeUnitAt(0) == 0xFEFF) {
      body = body.substring(1);
    }
    return body.trim();
  }

  // Get the last commit timestamp (ms since epoch) for a file path via GitHub API.
  static Future<int?> _lastCommitMs(String path) async {
    final url = '$_apiBase/commits?path=content/$path&per_page=1';
    final resp = await httpGet(Uri.parse(url));
    if (resp.statusCode != 200) return null;
    final list = jsonDecode(resp.body);
    if (list is List && list.isNotEmpty) {
      final dateStr = list[0]?['commit']?['committer']?['date'];
      if (dateStr is String)
        return DateTime.parse(dateStr).millisecondsSinceEpoch;
    }
    return null;
  }

  static void _mergeDictFromJson(String jsonStr) {
    final parsed = jsonDecode(jsonStr);
    if (parsed is! Map) return;
    parsed.forEach((k, v) {
      if (v is Map) {
        dict[k.toString()] = E(
          (v['en'] ?? '').toString(),
          (v['pos'] ?? '').toString(),
          v['g']?.toString(),
          v['note']?.toString(),
        );
      } else if (v is List) {
        // compact form [en, pos, g?, note?]
        dict[k.toString()] = E(
          v.isNotEmpty ? v[0].toString() : '',
          v.length > 1 ? v[1].toString() : '',
          v.length > 2 ? v[2]?.toString() : null,
          v.length > 3 ? v[3]?.toString() : null,
        );
      }
    });
  }

  static Story _storyFromJson(dynamic j) {
    final m = Map<String, dynamic>.from(j);
    final sentences = (m['sn'] as List? ?? []).map((e) {
      final sm = Map<String, dynamic>.from(e);
      return Sn((sm['s'] ?? '').toString(), (sm['e'] ?? '').toString());
    }).toList();
    return Story(
      id: (m['id'] ?? '').toString(),
      title: (m['title'] ?? 'Untitled').toString(),
      desc: (m['desc'] ?? '').toString(),
      ph: (m['ph'] ?? m['phase'] ?? 0) is int
          ? (m['ph'] ?? m['phase'] ?? 0)
          : int.tryParse('${m['ph'] ?? m['phase']}') ?? 0,
      diff: (m['diff'] ?? 1) is int
          ? (m['diff'] ?? 1)
          : int.tryParse('${m['diff']}') ?? 1,
      wu: (m['wu'] as List? ?? []).map((e) => e.toString()).toList(),
      sn: sentences,
    );
  }

  static Pattern _patternFromJson(Map<String, dynamic> j) => Pattern(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        text: (j['text'] ?? '').toString(),
        min: j['min'] is int
            ? j['min'] as int
            : int.tryParse('${j['min']}') ?? 3,
        trigger:
            (j['trigger'] as List? ?? []).map((e) => e.toString()).toList(),
      );

  // Insert or replace a story in the runtime list (by id).
  static void _upsertStory(Story s) {
    final i = stories.indexWhere((x) => x.id == s.id);
    if (i >= 0) {
      stories[i] = s;
    } else {
      stories.add(s);
    }
  }
}

// ══════════════════════════════════════════════════════════
// LESSONS SCREEN — browse all lessons from the manifest,
// download/remove for offline, check for updates.
// ══════════════════════════════════════════════════════════
class LessonsScreen extends StatefulWidget {
  const LessonsScreen({super.key});
  @override
  State<LessonsScreen> createState() => _LessonsScreenState();
}

class _LessonsScreenState extends State<LessonsScreen> {
  bool checking = false;
  String? status;
  final Set<String> busy = {}; // lesson ids currently downloading/removing

  Future<void> _check() async {
    setState(() {
      checking = true;
      status = null;
    });
    final result = await Content.checkForUpdates();
    if (!mounted) return;
    setState(() {
      checking = false;
      status = result;
    });
  }

  Future<void> _download(ManifestLesson ml) async {
    setState(() => busy.add(ml.id));
    try {
      await Content.downloadLesson(ml);
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Download failed — check your connection.')));
    } finally {
      if (mounted) setState(() => busy.remove(ml.id));
    }
  }

  void _remove(ManifestLesson ml) {
    Content.removeDownload(ml.id);
    setState(() {});
  }

  Future<void> _confirmRemove(ManifestLesson ml) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: T.sf,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Remove offline copy?',
            style: TextStyle(
                color: T.txt, fontSize: 17, fontWeight: FontWeight.w700)),
        content: Text(
            '"${ml.title}" will be removed from your phone. You can still read it online, and your progress is kept.',
            style: const TextStyle(color: T.tm, fontSize: 14, height: 1.4)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel', style: TextStyle(color: T.tm))),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: T.coral, foregroundColor: T.w),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (ok == true) {
      Content.removeDownload(ml.id);
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = Content.manifest;
    // Group lessons by phase
    final lessons = m?.lessons ?? [];
    final byPhase = <int, List<ManifestLesson>>{};
    for (final l in lessons) {
      (byPhase[l.phase] ??= []).add(l);
    }
    final phases = byPhase.keys.toList()..sort();

    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title: const Text('Lessons',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt))),
      body: SafeArea(
          top: false,
          child: Column(children: [
            // Update bar
            Container(
                padding: EdgeInsets.fromLTRB(20, 12, 20, 12),
                color: T.sf,
                child: Row(children: [
                  Expanded(
                      child: Text(
                          status ??
                              (m == null
                                  ? 'No content loaded yet. Tap to fetch from the server.'
                                  : '${lessons.length} lessons available'),
                          style: const TextStyle(fontSize: 12, color: T.tm))),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                        backgroundColor: T.indigo,
                        foregroundColor: T.w,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8))),
                    onPressed: checking ? null : _check,
                    child: checking
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: T.w))
                        : const Text('Check for updates',
                            style: TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ])),
            Expanded(
                child: m == null
                    ? const Center(
                        child: Padding(
                            padding: EdgeInsets.all(40),
                            child: Text(
                                'Tap "Check for updates" to load lessons from your content server for the first time.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: T.tm, height: 1.5))))
                    : ListView(
                        padding: EdgeInsets.fromLTRB(20, 12, 20,
                            20 + MediaQuery.of(context).padding.bottom),
                        children: [
                            for (final ph in phases) ...[
                              Padding(
                                  padding:
                                      const EdgeInsets.only(top: 8, bottom: 8),
                                  child: Text('PHASE $ph',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          color: T.gold,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 1))),
                              ...byPhase[ph]!.map((ml) {
                                final state = Content.lessonState(ml.id);
                                final isBusy = busy.contains(ml.id);
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  decoration: BoxDecoration(
                                      color: T.sf,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border(
                                          left: BorderSide(
                                              color: state == DlState.downloaded
                                                  ? T.teal
                                                  : state == DlState.outOfDate
                                                      ? T.coral
                                                      : T.sf3,
                                              width: 3))),
                                  child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Row(children: [
                                        Expanded(
                                            child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                              Row(children: [
                                                Flexible(
                                                    child: Text(ml.title,
                                                        style: const TextStyle(
                                                            fontSize: 14,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            color: T.txt))),
                                                if (state == DlState.outOfDate)
                                                  Padding(
                                                      padding:
                                                          const EdgeInsets.only(
                                                              left: 8),
                                                      child: Container(
                                                          padding:
                                                              const EdgeInsets.symmetric(
                                                                  horizontal: 6,
                                                                  vertical: 1),
                                                          decoration: BoxDecoration(
                                                              color: T.cd,
                                                              borderRadius:
                                                                  BorderRadius
                                                                      .circular(
                                                                          4)),
                                                          child: const Text(
                                                              'UPDATE',
                                                              style: TextStyle(
                                                                  fontSize: 9,
                                                                  color:
                                                                      T.coral,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w700)))),
                                              ]),
                                              Text(ml.desc,
                                                  style: const TextStyle(
                                                      fontSize: 11,
                                                      color: T.tm)),
                                            ])),
                                        const SizedBox(width: 10),
                                        // Download / remove control
                                        if (isBusy)
                                          const SizedBox(
                                              width: 20,
                                              height: 20,
                                              child: CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                  color: T.gold))
                                        else if (state == DlState.notDownloaded)
                                          GestureDetector(
                                              onTap: () => _download(ml),
                                              child: const Icon(
                                                  Icons.download_outlined,
                                                  color: T.tm,
                                                  size: 24))
                                        else if (state == DlState.outOfDate)
                                          GestureDetector(
                                              onTap: () => _download(ml),
                                              child: const Icon(Icons.refresh,
                                                  color: T.coral, size: 24))
                                        else
                                          Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                const Icon(Icons.offline_pin,
                                                    color: T.teal, size: 20),
                                                const SizedBox(width: 12),
                                                GestureDetector(
                                                    onTap: () =>
                                                        _confirmRemove(ml),
                                                    child: const Icon(
                                                        Icons.delete_outline,
                                                        color: T.coral,
                                                        size: 24)),
                                              ]),
                                      ])),
                                );
                              }),
                            ],
                            const SizedBox(height: 20),
                            const Center(
                                child: Text(
                                    'Tap ↓ to save a lesson for offline use.\nTap the trash icon to remove a saved copy (your progress is kept).\nRead lessons from the Phases on the home screen.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: T.dim,
                                        height: 1.5))),
                          ])),
          ])),
    );
  }
}

// ══════════════════════════════════════════════════════════
// PHASE SCREEN — shows the stories within one phase.
// Tapping a story confirms before starting.
// ══════════════════════════════════════════════════════════
class PhaseScreen extends StatefulWidget {
  final int phase;
  const PhaseScreen({super.key, required this.phase});
  @override
  State<PhaseScreen> createState() => _PhaseScreenState();
}

class _PhaseScreenState extends State<PhaseScreen> {
  Future<void> _confirmStart(_PhaseItem it) async {
    final sr = (Store.prog()['storiesRead'] as List?) ?? [];
    final alreadyRead = sr.contains(it.id);
    final downloaded = Content.isDownloaded(it.id);

    // Try to find already-loaded content for the warm-up/sentence counts.
    Story? loaded;
    for (final s in STORIES) {
      if (s.id == it.id) {
        loaded = s;
        break;
      }
    }

    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: T.sf,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(it.title,
            style: const TextStyle(
                color: T.txt, fontSize: 18, fontWeight: FontWeight.w700)),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(it.desc, style: const TextStyle(color: T.tm, fontSize: 14)),
              if (loaded != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(children: [
                      const Icon(Icons.menu_book, size: 16, color: T.gold),
                      const SizedBox(width: 6),
                      Text(
                          '${loaded.wu.length} words to warm up · ${loaded.sn.length} sentences',
                          style: const TextStyle(color: T.tm, fontSize: 12)),
                    ])),
              Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(children: [
                    Icon(downloaded ? Icons.offline_pin : Icons.cloud_outlined,
                        size: 15, color: downloaded ? T.teal : T.tm),
                    const SizedBox(width: 6),
                    Text(downloaded ? 'Saved offline' : 'Loads from internet',
                        style: TextStyle(
                            color: downloaded ? T.teal : T.tm, fontSize: 12)),
                  ])),
              if (alreadyRead)
                Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                        'You\'ve read this before — reading again reinforces the words.',
                        style: TextStyle(color: T.teal, fontSize: 12))),
            ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, 'cancel'),
              child: const Text('Cancel', style: TextStyle(color: T.tm))),
          // Download / remove toggle (only meaningful when there's a manifest entry)
          if (it.ml != null)
            TextButton(
                onPressed: () =>
                    Navigator.pop(ctx, downloaded ? 'remove' : 'download'),
                child: Text(downloaded ? 'Remove offline' : 'Save offline',
                    style: const TextStyle(color: T.indigo))),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: T.gold, foregroundColor: T.w),
              onPressed: () => Navigator.pop(ctx, 'start'),
              child: Text(alreadyRead ? 'Read Again' : 'Start')),
        ],
      ),
    );

    if (action == null || action == 'cancel' || !mounted) return;

    if (action == 'remove' && it.ml != null) {
      Content.removeDownload(it.id);
      setState(() {});
      return;
    }
    if (action == 'download' && it.ml != null) {
      try {
        await Content.downloadLesson(it.ml!);
        if (mounted) {
          setState(() {});
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Saved for offline use.')));
        }
      } catch (e) {
        if (mounted)
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Download failed — check your connection.')));
      }
      return;
    }
    if (action == 'start') {
      // Resolve the Story: use loaded copy, else fetch on demand.
      Story? story = loaded;
      if (story == null && it.ml != null) {
        try {
          story = await Content.openLesson(it.ml!);
        } catch (e) {
          if (mounted)
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text(
                    "Can't open — you're offline and this lesson isn't downloaded.")));
          return;
        }
      }
      if (story != null && mounted) {
        await Navigator.push(context,
            MaterialPageRoute(builder: (_) => ReaderScreen(story: story!)));
        setState(() {});
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sr = (Store.prog()['storiesRead'] as List?) ?? [];
    final m = Content.manifest;

    // Build the list of lessons for this phase.
    // Prefer the manifest (knows ALL lessons, downloaded or not); fall back to
    // loaded STORIES when there's no manifest yet (first run, offline).
    List<_PhaseItem> items;
    if (m != null && m.lessons.any((l) => l.phase == widget.phase)) {
      items = m.lessons
          .where((l) => l.phase == widget.phase)
          .map((l) => _PhaseItem(
              id: l.id, title: l.title, desc: l.desc, diff: l.diff, ml: l))
          .toList()
        ..sort((a, b) => a.diff.compareTo(b.diff));
    } else {
      items = STORIES
          .where((s) => s.ph == widget.phase)
          .map((s) => _PhaseItem(
              id: s.id, title: s.title, desc: s.desc, diff: s.diff, ml: null))
          .toList()
        ..sort((a, b) => a.diff.compareTo(b.diff));
    }

    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Phase ${widget.phase} — ${phaseName(widget.phase)}',
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
            Text(phaseDesc(widget.phase),
                style: const TextStyle(fontSize: 11, color: T.tm)),
          ])),
      body: SafeArea(
          top: false,
          child: items.isEmpty
              ? const Center(
                  child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Text(
                          'No stories in this phase yet. Add some to your content repo and check for updates.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: T.tm, height: 1.5))))
              : ListView(
                  padding: EdgeInsets.fromLTRB(
                      20, 16, 20, 20 + MediaQuery.of(context).padding.bottom),
                  children: items.map((it) {
                    final rd = sr.contains(it.id);
                    final downloaded = Content.isDownloaded(it.id);
                    return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                            color: T.sf,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: () => _confirmStart(it),
                                child: Container(
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                        border: Border(
                                            left: BorderSide(
                                                color: rd ? T.teal : T.sf3,
                                                width: 3))),
                                    child: Row(children: [
                                      Expanded(
                                          child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                            Text(it.title,
                                                style: const TextStyle(
                                                    fontSize: 15,
                                                    fontWeight: FontWeight.w600,
                                                    color: T.txt)),
                                            Text(it.desc,
                                                style: const TextStyle(
                                                    fontSize: 12, color: T.tm)),
                                          ])),
                                      if (downloaded)
                                        const Padding(
                                            padding: EdgeInsets.only(right: 8),
                                            child: Icon(Icons.offline_pin,
                                                size: 16, color: T.teal)),
                                      if (rd)
                                        const Padding(
                                            padding: EdgeInsets.only(right: 4),
                                            child: Text('✓',
                                                style: TextStyle(
                                                    fontSize: 14,
                                                    color: T.teal,
                                                    fontWeight:
                                                        FontWeight.w600))),
                                      const Text('›',
                                          style: TextStyle(
                                              fontSize: 18, color: T.dim)),
                                    ])))));
                  }).toList())),
    );
  }
}

// Lightweight row model for the phase list (works for both manifest + bundled).
class _PhaseItem {
  final String id, title, desc;
  final int diff;
  final ManifestLesson? ml; // present when it came from the manifest
  _PhaseItem(
      {required this.id,
      required this.title,
      required this.desc,
      required this.diff,
      this.ml});
}

// ══════════════════════════════════════════════════════════
// WORD ORDER TRAINER — rebuild a Spanish sentence from scrambled
// words, learning how Spanish word order differs from English.
// Pulls from sentences in stories you've already read.
// ══════════════════════════════════════════════════════════
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key});
  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  final _rng = Random();
  late List<Sn> pool;
  Sn? current;
  List<String> correctWords = []; // the target order
  List<String> scrambled = []; // remaining word bank
  List<String> built = []; // what the user has assembled
  int score = 0, total = 0, round = 0;
  bool done = false;
  bool? lastResult;

  @override
  void initState() {
    super.initState();
    // Build a pool from READ stories, short sentences only (3–8 words).
    final read = (Store.prog()['storiesRead'] as List?) ?? [];
    final readStories = STORIES.where((s) => read.contains(s.id)).toList();
    final source = readStories.isNotEmpty ? readStories : STORIES;
    pool = [];
    for (final s in source) {
      for (final sn in s.sn) {
        final words = sn.s
            .split(RegExp(r'\s+'))
            .where((w) => w.trim().isNotEmpty)
            .toList();
        // Skip quotes/dialogue markers and very long/short ones
        if (words.length >= 3 && words.length <= 7 && !sn.s.contains('"')) {
          pool.add(sn);
        }
      }
    }
    pool.shuffle();
    _next();
  }

  void _next() {
    if (pool.isEmpty) {
      current = null;
      return;
    }
    current = pool[round % pool.length];
    correctWords = current!.s
        .split(RegExp(r'\s+'))
        .where((w) => w.trim().isNotEmpty)
        .toList();
    scrambled = List.from(correctWords)..shuffle(_rng);
    // Ensure it's actually scrambled (not accidentally in order)
    if (scrambled.join(' ') == correctWords.join(' ') && scrambled.length > 1) {
      scrambled = scrambled.reversed.toList();
    }
    built = [];
    lastResult = null;
  }

  void _check() {
    final ok = built.join(' ') == correctWords.join(' ');
    setState(() {
      lastResult = ok;
      total++;
      if (ok) {
        score++;
        Store.recordActivity();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (pool.isEmpty) {
      return Scaffold(
        appBar: AppBar(
            backgroundColor: T.sf,
            elevation: 0,
            iconTheme: const IconThemeData(color: T.tm),
            title: const Text('Word Order',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: T.txt))),
        body: const Center(
            child: Padding(
                padding: EdgeInsets.all(40),
                child: Text(
                    'Read a story first — this trainer builds sentences from what you\'ve read.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: T.tm, height: 1.5)))),
      );
    }
    if (done) {
      final pct = total > 0 ? (score / total * 100).round() : 0;
      return Scaffold(
          body: Center(
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text("🧩", style: TextStyle(fontSize: 48)),
                    const SizedBox(height: 12),
                    const Text('Word Order Complete',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: T.txt)),
                    Text('$pct%',
                        style: TextStyle(
                            fontSize: 40,
                            fontWeight: FontWeight.w700,
                            color: pct >= 80
                                ? T.teal
                                : pct >= 50
                                    ? T.gold
                                    : T.coral)),
                    Text('$score/$total correct',
                        style: const TextStyle(fontSize: 14, color: T.tm)),
                    const SizedBox(height: 24),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.teal,
                                foregroundColor: T.w,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => setState(() {
                                  score = 0;
                                  total = 0;
                                  round = 0;
                                  done = false;
                                  pool.shuffle();
                                  _next();
                                }),
                            child: const Text('Train Again'))),
                    const SizedBox(height: 8),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.sf,
                                foregroundColor: T.tm,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Home'))),
                  ]))));
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: T.sf,
        elevation: 0,
        iconTheme: const IconThemeData(color: T.tm),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Word Order',
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
          Text('Round ${round + 1} of 10',
              style: const TextStyle(fontSize: 11, color: T.tm)),
        ]),
        actions: [
          Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                  child: Text('$score/$total',
                      style: const TextStyle(
                          fontSize: 13,
                          color: T.teal,
                          fontWeight: FontWeight.w600))))
        ],
        bottom: PreferredSize(
            preferredSize: const Size.fromHeight(3),
            child: LinearProgressIndicator(
                value: (round + 1) / 10,
                backgroundColor: T.sf3,
                color: T.teal,
                minHeight: 3)),
      ),
      body: SafeArea(
          top: false,
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('BUILD THE SPANISH SENTENCE',
                        style: TextStyle(
                            fontSize: 11, color: T.tm, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    // English prompt
                    Text(current!.e,
                        style: const TextStyle(
                            fontSize: 18,
                            color: T.gold,
                            fontWeight: FontWeight.w600,
                            height: 1.4)),
                    const SizedBox(height: 20),
                    // The sentence being built (tap a word to remove it)
                    Container(
                        width: double.infinity,
                        constraints: const BoxConstraints(minHeight: 60),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                            color: T.sf,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: lastResult == null
                                    ? T.sf3
                                    : lastResult!
                                        ? T.teal
                                        : T.coral,
                                width: 2)),
                        child: built.isEmpty
                            ? const Text(
                                'Tap words below to build the sentence',
                                style: TextStyle(color: T.dim, fontSize: 14))
                            : Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: built
                                    .asMap()
                                    .entries
                                    .map((entry) => GestureDetector(
                                        onTap: lastResult != null
                                            ? null
                                            : () => setState(() {
                                                  scrambled.add(built
                                                      .removeAt(entry.key));
                                                }),
                                        child: Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 10, vertical: 6),
                                            decoration: BoxDecoration(
                                                color: T.sf2,
                                                borderRadius:
                                                    BorderRadius.circular(8)),
                                            child: Text(entry.value,
                                                style: const TextStyle(
                                                    fontSize: 15,
                                                    color: T.txt)))))
                                    .toList())),
                    const SizedBox(height: 16),
                    // Word bank
                    if (lastResult == null)
                      Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: scrambled
                              .asMap()
                              .entries
                              .map((entry) => GestureDetector(
                                  onTap: () => setState(() {
                                        built
                                            .add(scrambled.removeAt(entry.key));
                                      }),
                                  child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 14, vertical: 10),
                                      decoration: BoxDecoration(
                                          color: T.indigo.withOpacity(0.15),
                                          borderRadius:
                                              BorderRadius.circular(8),
                                          border: Border.all(
                                              color:
                                                  T.indigo.withOpacity(0.3))),
                                      child: Text(entry.value,
                                          style: const TextStyle(
                                              fontSize: 15,
                                              color: T.txt,
                                              fontWeight: FontWeight.w500)))))
                              .toList()),
                    // Result feedback
                    if (lastResult != null) ...[
                      Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                              color: lastResult! ? T.td : T.cd,
                              borderRadius: BorderRadius.circular(12)),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  Icon(
                                      lastResult!
                                          ? Icons.check_circle
                                          : Icons.cancel,
                                      color: lastResult! ? T.teal : T.coral,
                                      size: 18),
                                  const SizedBox(width: 8),
                                  Text(lastResult! ? 'Correct!' : 'Not quite',
                                      style: TextStyle(
                                          color: lastResult! ? T.teal : T.coral,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 14)),
                                  const SizedBox(width: 8),
                                  GestureDetector(
                                      onTap: () => Speech.speak(current!.s),
                                      child: const Icon(Icons.volume_up_rounded,
                                          size: 18, color: T.gold)),
                                ]),
                                if (!lastResult!)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 8),
                                      child: Text(
                                          'Correct: ${correctWords.join(' ')}',
                                          style: const TextStyle(
                                              color: T.txt,
                                              fontSize: 14,
                                              fontFamily: 'Georgia'))),
                              ])),
                    ],
                    const SizedBox(height: 20),
                    // Buttons
                    if (lastResult == null)
                      SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      built.isEmpty ? T.sf2 : T.teal,
                                  foregroundColor: T.w,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 14)),
                              onPressed: built.length == correctWords.length
                                  ? _check
                                  : null,
                              child: const Text('Check',
                                  style:
                                      TextStyle(fontWeight: FontWeight.w600))))
                    else
                      SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: T.teal,
                                  foregroundColor: T.w,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 14)),
                              onPressed: () {
                                if (round >= 9) {
                                  setState(() => done = true);
                                } else {
                                  setState(() {
                                    round++;
                                    _next();
                                  });
                                }
                              },
                              child: Text(round >= 9 ? 'See Results' : 'Next →',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)))),
                  ]))),
    );
  }
}

// ══════════════════════════════════════════════════════════
// SCENARIOS LIST — browse scenarios from the manifest, grouped by phase.
// ══════════════════════════════════════════════════════════
class ScenariosScreen extends StatefulWidget {
  const ScenariosScreen({super.key});
  @override
  State<ScenariosScreen> createState() => _ScenariosScreenState();
}

class _ScenariosScreenState extends State<ScenariosScreen> {
  bool loading = false;

  Future<void> _open(ManifestLesson ms) async {
    setState(() => loading = true);
    try {
      final scn = await Content.openScenario(ms);
      if (!mounted) return;
      setState(() => loading = false);
      await Navigator.push(context,
          MaterialPageRoute(builder: (_) => ScenarioPlayer(scenario: scn)));
      setState(() {});
    } catch (e) {
      if (mounted) {
        setState(() => loading = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                "Can't load — you're offline and this scenario isn't downloaded.")));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = Content.manifest;
    final scns = m?.scenarios ?? [];
    final byPhase = <int, List<ManifestLesson>>{};
    for (final s in scns) {
      (byPhase[s.phase] ??= []).add(s);
    }
    final phases = byPhase.keys.toList()..sort();

    return Scaffold(
      appBar: AppBar(
          backgroundColor: T.sf,
          elevation: 0,
          iconTheme: const IconThemeData(color: T.tm),
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Scenarios',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
            const Text('Practice real conversations',
                style: TextStyle(fontSize: 11, color: T.tm)),
          ])),
      body: SafeArea(
          top: false,
          child: loading
              ? const Center(child: CircularProgressIndicator(color: T.gold))
              : scns.isEmpty
                  ? const Center(
                      child: Padding(
                          padding: EdgeInsets.all(40),
                          child: Text(
                              'No scenarios yet. Add some to your content repo and tap "Check for updates" in the Lessons screen.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: T.tm, height: 1.5))))
                  : ListView(
                      padding: EdgeInsets.fromLTRB(20, 16, 20,
                          20 + MediaQuery.of(context).padding.bottom),
                      children: [
                          for (final ph in phases) ...[
                            Padding(
                                padding:
                                    const EdgeInsets.only(top: 8, bottom: 8),
                                child: Text('PHASE $ph — ${phaseName(ph)}',
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: T.gold,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 1))),
                            ...byPhase[ph]!.map((ms) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Material(
                                    color: T.sf,
                                    borderRadius: BorderRadius.circular(12),
                                    child: InkWell(
                                        borderRadius: BorderRadius.circular(12),
                                        onTap: () => _open(ms),
                                        child: Container(
                                            padding: const EdgeInsets.all(14),
                                            decoration: BoxDecoration(
                                                border: Border(
                                                    left: BorderSide(
                                                        color: Content
                                                                .isScenarioDownloaded(
                                                                    ms.id)
                                                            ? T.teal
                                                            : T.indigo,
                                                        width: 3))),
                                            child: Row(children: [
                                              const Text('💬',
                                                  style:
                                                      TextStyle(fontSize: 20)),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                  child: Column(
                                                      crossAxisAlignment:
                                                          CrossAxisAlignment
                                                              .start,
                                                      children: [
                                                    Text(ms.title,
                                                        style: const TextStyle(
                                                            fontSize: 15,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            color: T.txt)),
                                                    Text(ms.desc,
                                                        style: const TextStyle(
                                                            fontSize: 12,
                                                            color: T.tm)),
                                                  ])),
                                              const Text('›',
                                                  style: TextStyle(
                                                      fontSize: 18,
                                                      color: T.dim)),
                                            ])))))),
                          ],
                        ])),
    );
  }
}

// ══════════════════════════════════════════════════════════
// SCENARIO PLAYER — step through a conversation, picking replies.
// ══════════════════════════════════════════════════════════
class ScenarioPlayer extends StatefulWidget {
  final Scenario scenario;
  const ScenarioPlayer({super.key, required this.scenario});
  @override
  State<ScenarioPlayer> createState() => _ScenarioPlayerState();
}

class _ScenarioPlayerState extends State<ScenarioPlayer> {
  int stepIdx = 0;
  int? chosen; // index of chosen option in current step
  int goodCount = 0; // tally of "good" answers
  bool done = false;

  ScenarioStep get step => widget.scenario.steps[stepIdx];

  void _choose(int i) {
    setState(() {
      chosen = i;
      final v = step.options[i].verdict;
      if (v == 'good') goodCount++;
      Store.recordActivity();
    });
  }

  void _next() {
    if (stepIdx >= widget.scenario.steps.length - 1) {
      setState(() => done = true);
    } else {
      setState(() {
        stepIdx++;
        chosen = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.scenario.steps.isEmpty) {
      return Scaffold(
        appBar: AppBar(
            backgroundColor: T.sf,
            elevation: 0,
            iconTheme: const IconThemeData(color: T.tm)),
        body: const Center(
            child: Text('This scenario has no steps.',
                style: TextStyle(color: T.tm))),
      );
    }
    if (done) {
      final total = widget.scenario.steps.length;
      final pct = total > 0 ? (goodCount / total * 100).round() : 0;
      return Scaffold(
          body: Center(
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(
                        pct >= 80
                            ? "🌟"
                            : pct >= 50
                                ? "👍"
                                : "💬",
                        style: const TextStyle(fontSize: 48)),
                    const SizedBox(height: 12),
                    const Text('Conversation Complete',
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: T.txt)),
                    Text('$goodCount of $total ideal replies',
                        style: const TextStyle(fontSize: 14, color: T.tm)),
                    const SizedBox(height: 4),
                    Text('$pct%',
                        style: TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w700,
                            color: pct >= 80
                                ? T.teal
                                : pct >= 50
                                    ? T.gold
                                    : T.coral)),
                    const SizedBox(height: 24),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.gold,
                                foregroundColor: T.w,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => setState(() {
                                  stepIdx = 0;
                                  chosen = null;
                                  goodCount = 0;
                                  done = false;
                                }),
                            child: const Text('Try Again'))),
                    const SizedBox(height: 8),
                    SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                                backgroundColor: T.sf,
                                foregroundColor: T.tm,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Done'))),
                  ]))));
    }

    final opt = chosen != null ? step.options[chosen!] : null;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: T.sf,
        elevation: 0,
        iconTheme: const IconThemeData(color: T.tm),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.scenario.title,
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: T.txt)),
          Text('Step ${stepIdx + 1} of ${widget.scenario.steps.length}',
              style: const TextStyle(fontSize: 11, color: T.tm)),
        ]),
        bottom: PreferredSize(
            preferredSize: const Size.fromHeight(3),
            child: LinearProgressIndicator(
                value: (stepIdx + 1) / widget.scenario.steps.length,
                backgroundColor: T.sf3,
                color: T.gold,
                minHeight: 3)),
      ),
      body: SafeArea(
          top: false,
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (stepIdx == 0 && widget.scenario.setting.isNotEmpty)
                      Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                              color: T.sf,
                              borderRadius: BorderRadius.circular(10)),
                          child: Text('📍 ${widget.scenario.setting}',
                              style: const TextStyle(
                                  fontSize: 13,
                                  color: T.tm,
                                  fontStyle: FontStyle.italic))),
                    // The other person's line (a speech bubble)
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                              width: 36,
                              height: 36,
                              decoration: const BoxDecoration(
                                  color: T.sf2, shape: BoxShape.circle),
                              child: const Center(
                                  child: Text('🧑',
                                      style: TextStyle(fontSize: 18)))),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                      color: T.sf,
                                      borderRadius: const BorderRadius.only(
                                          topRight: Radius.circular(14),
                                          bottomLeft: Radius.circular(14),
                                          bottomRight: Radius.circular(14))),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        if (step.speaker.isNotEmpty)
                                          Text(step.speaker,
                                              style: const TextStyle(
                                                  fontSize: 11,
                                                  color: T.gold,
                                                  fontWeight: FontWeight.w600)),
                                        if (step.speaker.isNotEmpty)
                                          const SizedBox(height: 4),
                                        Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Expanded(
                                                  child: Text(step.promptEs,
                                                      style: const TextStyle(
                                                          fontSize: 16,
                                                          color: T.txt,
                                                          fontFamily: 'Georgia',
                                                          height: 1.4))),
                                              GestureDetector(
                                                  onTap: () => Speech.speak(
                                                      step.promptEs),
                                                  child: const Padding(
                                                      padding: EdgeInsets.only(
                                                          left: 6),
                                                      child: Icon(
                                                          Icons
                                                              .volume_up_rounded,
                                                          size: 18,
                                                          color: T.gold))),
                                            ]),
                                        const SizedBox(height: 4),
                                        Text(step.promptEn,
                                            style: const TextStyle(
                                                fontSize: 12,
                                                color: T.tm,
                                                fontStyle: FontStyle.italic)),
                                      ]))),
                        ]),
                    const SizedBox(height: 20),
                    Text('YOUR REPLY',
                        style: const TextStyle(
                            fontSize: 11, color: T.tm, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    // Reply options
                    ...step.options.asMap().entries.map((entry) {
                      final i = entry.key;
                      final o = entry.value;
                      final isChosen = chosen == i;
                      Color border = T.sf3, bg = T.sf;
                      if (chosen != null && isChosen) {
                        final col = o.verdict == 'good'
                            ? T.teal
                            : o.verdict == 'ok'
                                ? T.gold
                                : T.coral;
                        border = col;
                        bg = col.withOpacity(0.12);
                      }
                      return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: GestureDetector(
                              onTap: chosen != null ? null : () => _choose(i),
                              child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                      color: bg,
                                      border:
                                          Border.all(color: border, width: 2),
                                      borderRadius: BorderRadius.circular(12)),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Expanded(
                                                  child: Text(o.es,
                                                      style: const TextStyle(
                                                          fontSize: 15,
                                                          color: T.txt,
                                                          fontWeight: FontWeight
                                                              .w500))),
                                              if (chosen != null && isChosen)
                                                GestureDetector(
                                                    onTap: () =>
                                                        Speech.speak(o.es),
                                                    child: const Padding(
                                                        padding:
                                                            EdgeInsets.only(
                                                                left: 6),
                                                        child: Icon(
                                                            Icons
                                                                .volume_up_rounded,
                                                            size: 16,
                                                            color: T.gold))),
                                            ]),
                                        if (chosen != null && isChosen) ...[
                                          const SizedBox(height: 4),
                                          Text(o.en,
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  color: T.tm,
                                                  fontStyle: FontStyle.italic)),
                                          if (o.feedback.isNotEmpty)
                                            Padding(
                                                padding: const EdgeInsets.only(
                                                    top: 8),
                                                child: Text(o.feedback,
                                                    style: TextStyle(
                                                        fontSize: 13,
                                                        color: o.verdict ==
                                                                'good'
                                                            ? T.teal
                                                            : o.verdict == 'ok'
                                                                ? T.gold
                                                                : T.coral,
                                                        height: 1.4))),
                                        ],
                                      ]))));
                    }),
                    if (chosen != null)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: T.gold,
                                      foregroundColor: T.w,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14)),
                                  onPressed: _next,
                                  child: Text(
                                      stepIdx >=
                                              widget.scenario.steps.length - 1
                                          ? 'Finish'
                                          : 'Continue →',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600))))),
                  ]))),
    );
  }
}
