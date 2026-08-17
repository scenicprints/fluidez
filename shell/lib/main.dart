import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'theme.dart';
import 'updater.dart';

/// The Fluidez web app is the real thing; this Android app is a chromeless
/// shell around it so it looks and feels native. Friends on iPhone open the
/// same URL in Safari and Add to Home Screen.
///
/// Because the app itself lives on GitHub Pages, this shell almost never needs
/// rebuilding — bug fixes and new lessons reach everyone without an APK.
const String kAppUrl = 'https://scenicprints.github.io/fluidez/';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: kBg,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: kBg,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const FluidezApp());
}

class FluidezApp extends StatelessWidget {
  const FluidezApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fluidez',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: kBg,
        colorScheme: const ColorScheme.dark(surface: kBg, primary: kAccent),
      ),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});
  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController _controller;
  ReleaseInfo? _pendingUpdate;
  bool _bannerDismissed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBg)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (NavigationRequest request) {
          final Uri uri = Uri.parse(request.url);
          // Anything that isn't the app itself — an invite link being shared,
          // mailto, tel — belongs to the real browser. A WebView either
          // refuses these or strands you outside the app with no way back.
          if (uri.scheme == 'mailto' || uri.scheme == 'tel' || uri.scheme == 'sms') {
            launchUrl(uri, mode: LaunchMode.externalApplication);
            return NavigationDecision.prevent;
          }
          if (uri.host.isNotEmpty && !kAppUrl.contains(uri.host)) {
            launchUrl(uri, mode: LaunchMode.externalApplication);
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(kAppUrl));

    _checkForUpdate();
  }

  Future<void> _checkForUpdate() async {
    try {
      final ReleaseInfo? r = await Updater.fetchLatest();
      if (r == null || !mounted) return;
      final String current = await Updater.currentVersion();
      if (Updater.isNewer(r.version, current)) {
        setState(() => _pendingUpdate = r);
      }
    } catch (_) {
      // Offline — never bother the user about it.
    }
  }

  Future<bool> _onBack() async {
    // Back closes whatever the web app has open before it leaves the app.
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  void _openUpdateSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => UpdateSheet(preloaded: _pendingUpdate),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) async {
        if (didPop) return;
        final bool shouldPop = await _onBack();
        if (shouldPop && mounted) {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: kBg,
        body: SafeArea(
          child: Column(
            children: <Widget>[
              if (_pendingUpdate != null && !_bannerDismissed)
                _UpdateBanner(
                  version: _pendingUpdate!.version,
                  onTap: _openUpdateSheet,
                  onDismiss: () => setState(() => _bannerDismissed = true),
                ),
              Expanded(
                child: Stack(
                  children: <Widget>[
                    WebViewWidget(
                      controller: _controller,
                      // Without this, Flutter's gesture arena swallows drags
                      // before the page sees them, and scrolling a lesson or
                      // dragging a slider stops working.
                      gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                        Factory<EagerGestureRecognizer>(
                            () => EagerGestureRecognizer()),
                      },
                    ),
                    // Long-press the very top edge for the update sheet — the
                    // only native chrome, and invisible until you want it.
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 20,
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onLongPress: _openUpdateSheet,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UpdateBanner extends StatelessWidget {
  final String version;
  final VoidCallback onTap;
  final VoidCallback onDismiss;
  const _UpdateBanner(
      {required this.version, required this.onTap, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kCard,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: kBorder)),
          ),
          child: Row(
            children: <Widget>[
              const Icon(Icons.system_update_alt_rounded,
                  size: 18, color: kAccent),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Update available — v$version · tap to install',
                    style: const TextStyle(
                        fontSize: 13,
                        color: kInk,
                        fontWeight: FontWeight.w600)),
              ),
              GestureDetector(
                onTap: onDismiss,
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close_rounded, size: 18, color: kMuted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
