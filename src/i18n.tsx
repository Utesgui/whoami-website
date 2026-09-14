import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { reliabilityText } from './reliabilityMessages'

export type Language = 'en' | 'de'
export type Interpolation = Readonly<Record<string, string | number>>
type Message = string | { one: string; other: string }
export const LANGUAGE_STORAGE_KEY = 'whoami.language.v1'
export const locales: Record<Language, string> = { en: 'en-US', de: 'de-DE' }

// Add semantic keys here and their German counterparts below. Plurals use a numeric `count`.
export const en = {
  'document.title': 'whoami — Your connection, clearly.',
  'document.description': 'See the public IP addresses your browser uses. An uncluttered, multi-connection-aware network check with IPv4, IPv6, and transparent diagnostics.',
  'language.label': 'Interface language',
  'language.english': 'English',
  'language.german': 'German',
  'language.storageWarning': 'Your language preference could not be read or saved in this browser. You can still switch languages for this visit.',
  'common.notProvided': 'Not provided',
  'common.notAvailable': 'Not available',
  'common.notExposed': 'Not exposed',
  'common.unavailable': 'Unavailable',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.observed': 'Observed',
  'common.checking': 'Checking',
  'common.notObserved': 'Not observed',
  'common.sources': { one: '{count} source', other: '{count} sources' },
  'common.dismiss': 'Dismiss notification',
  'nav.skip': 'Skip to connection overview',
  'nav.home': 'whoami home',
  'nav.label': 'Main navigation',
  'nav.overview': 'Overview',
  'nav.diagnostics': 'Diagnostics',
  'nav.howItWorks': 'How it works',
  'nav.privacy': 'Privacy information',
  'nav.browserOnline': 'Browser online',
  'nav.browserOffline': 'Browser offline',
  'demo.title': 'You’re exploring a demo.',
  'demo.description': 'These are example addresses, not your network.',
  'demo.provider': 'Example Broadband',
  'demo.asn': 'Example ASN',
  'demo.location': 'Example location (demo)',
  'demo.timezone': 'Europe/Berlin (example)',
  'demo.address': 'Example address',
  'demo.explore': 'Explore a demo',
  'demo.backToLive': 'Back to live',
  'page.offline': 'Your browser reports that it is offline. Reconnect, then scan again. Earlier observations stay below.',
  'page.heading': 'Your connection, clearly',
  'page.description': 'One place for the public IPs your browser uses. Even when there’s more than one.',
  'page.export': 'Export report',
  'connection.overview': 'Connection overview',
  'connection.observedPublic': 'Your observed public {family}',
  'connection.publicIp': 'Your public IP address',
  'connection.showIps': 'Show IP addresses',
  'connection.hideIps': 'Hide IP addresses',
  'connection.lookingUp': 'Looking you up…',
  'connection.notYetObserved': 'Not observed yet',
  'connection.copyPrimary': 'Copy primary IP address',
  'connection.seenThisScan': 'Seen in this scan',
  'connection.confirmed': { one: '{count} source confirmed this IP', other: '{count} sources confirmed this IP' },
  'connection.checkingDestinations': 'Checking independent IPv4 and IPv6 destinations.',
  'connection.tryAgain': 'A route may be unavailable, or a service may be blocked. Try again.',
  'scan.running': 'Checking your paths…',
  'scan.stopped': 'Scan stopped',
  'scan.example': 'Example results',
  'scan.complete': 'Scan complete',
  'scan.noPublicIp': 'No public IP observed',
  'scan.stop': 'Stop scan',
  'scan.checkConnection': 'Check my connection',
  'scan.again': 'Scan again',
  'scan.options': 'Scan options',
  'scan.deeper': 'Deeper discovery',
  'scan.deeperDescription': 'Three spaced rounds across {count} destinations in several networks. Useful for load-balanced or changing routes; takes up to ~35 seconds. Does not force a new connection.',
  'scan.includeWebRtc': 'Include WebRTC / STUN',
  'scan.optional': 'Optional',
  'scan.webRtcDescription': 'May reveal an IP outside your VPN or proxy. Contacts Google and Cloudflare STUN servers. No camera or microphone access.',
  'scan.optionsHint': 'Options apply to the next scan. Your browser and router still decide which connections to use.',
  'scan.addressesSummary': { one: 'public address this scan', other: 'public addresses this scan' },
  'scan.httpChecks': '{completed} / {planned} HTTP checks',
  'scan.checked': 'Checked {time}',
  'scan.ready': 'Ready to check',
  'diagram.label': { one: '{count} public address observed from this browser', other: '{count} public addresses observed from this browser' },
  'diagram.paths': 'Observed paths',
  'diagram.notPhysical': 'NOT PHYSICAL LINES',
  'diagram.browser': 'Your browser',
  'diagram.visibility': 'One view. More visibility.',
  'diagram.publicFamily': 'Public {family}',
  'diagram.looking': 'Looking for a path',
  'diagram.noOther': 'No other path observed',
  'diagram.evidence': { one: '{count} source · address {index}', other: '{count} sources · address {index}' },
  'diagram.more': '+{count} more in the list below',
  'address.label': 'Address {index}',
  'address.earlier': 'Earlier scan',
  'address.previouslySeen': 'Previously seen',
  'address.observations': { one: '{count} observation', other: '{count} observations' },
  'address.copy': 'Copy address',
  'address.copyNumber': 'Copy address {index}',
  'address.hideDetails': 'Hide details for address {index}',
  'address.showDetails': 'Show details for address {index}',
  'address.firstSeen': 'First seen',
  'address.lastSeen': 'Last seen',
  'address.evidence': 'Evidence',
  'address.distinctSources': { one: '{count} distinct source', other: '{count} distinct sources' },
  'address.networkAsn': 'Network / ASN',
  'address.location': 'Approximate location',
  'address.timezone': 'Network timezone',
  'address.moreContext': 'A little more context?',
  'address.lookupDescription': 'Look up the provider, ASN, and approximate location. This sends this IP to ipapi.co; location is not GPS-accurate.',
  'address.lookingUp': 'Looking up…',
  'address.lookup': 'Look up details',
  'addresses.heading': 'All discovered addresses',
  'addresses.description': 'Different destinations can see different sides of your connection.',
  'addresses.about': 'About multiple connections',
  'addresses.filter': 'Filter addresses',
  'addresses.all': 'All',
  'addresses.sessionNote': 'This tab’s observations',
  'addresses.finding': 'Finding your public addresses',
  'addresses.empty': 'No public addresses yet',
  'addresses.emptyFamily': 'No {family} address observed',
  'addresses.loadingHint': 'Each reachable destination adds its observation here.',
  'addresses.emptyHint': 'This does not mean the connection is missing. Check the diagnostics or try a deeper scan.',
  'addresses.tryAgain': 'Try another scan',
  'addresses.footnote': 'Kept in this tab only by default. Reloading clears unsaved history.',
  'addresses.multiTitle': 'Three lines doesn’t always mean three visible IPs.',
  'addresses.multiDescription': 'A router or VPN may send every request down the same path. Try a deeper scan, or switch your active connection and scan again to collect more addresses.',
  'addresses.multiLink': 'Understand multi-connection discovery',
  'environment.heading': 'From your browser',
  'environment.connection': 'Connection status',
  'environment.online': 'Online',
  'environment.offline': 'Offline',
  'environment.secure': 'Secure context',
  'environment.language': 'Browser language',
  'environment.timezone': 'Device timezone',
  'environment.estimate': 'Network estimate',
  'environment.disclaimer': 'Browser-reported, not a line inventory. The network estimate describes effective speed, not whether you’re on Wi-Fi, Ethernet, or mobile.',
  'privacy.title': 'Your network. Your data.',
  'privacy.summary': 'No accounts or analytics. Results stay in memory by default. Public checks contact external IP services.',
  'privacy.shared': 'What gets shared',
  'diagnostics.heading': 'Behind the results',
  'diagnostics.successes': { one: '{count} successful observation', other: '{count} successful observations' },
  'diagnostics.unavailable': { one: '{count} check unavailable', other: '{count} checks unavailable' },
  'diagnostics.subtitle': 'Per-destination results and request timings',
  'diagnostics.view': 'View diagnostics',
  'diagnostics.explanation': 'HTTP timings include connection setup and service response time; they are not ping or line-speed measurements. A failed IPv6 check does not prove your device lacks IPv6.',
  'diagnostics.destination': 'Destination',
  'diagnostics.round': 'Round',
  'diagnostics.result': 'Result',
  'diagnostics.time': 'HTTP / STUN time',
  'diagnostics.duration': '{duration} ms',
  'diagnostics.empty': 'No checks have finished yet.',
  'how.title': 'A wider view.',
  'how.subtitle': 'Not a crystal ball.',
  'how.description': 'Most IP tools show one answer. whoami asks multiple destinations and keeps the different answers together.',
  'faq.discoveryQuestion': 'How do you find more than one IP?',
  'faq.discoveryAnswer': 'Your browser contacts this server, ipify, and icanhazip over IPv4, IPv6, and dual-stack routes. Deeper discovery adds ident.me and ip4.me, using three spaced rounds against ten destinations. If your router distributes those requests across different public addresses, they appear separately here. Connections may be reused by the browser; repeated requests do not guarantee a new route.',
  'faq.discoveryStatic': 'This GitHub Pages edition contacts ipify and icanhazip over IPv4, IPv6, and dual-stack routes directly from your browser. Deeper discovery adds ident.me and ip4.me: nine destinations, three spaced rounds. Different observed public addresses appear separately. Your browser may reuse connections, and your router chooses the route. The site itself is static and does not provide a server-side IP API.',
  'faq.linesQuestion': 'Can you detect all three of my internet lines?',
  'faq.linesAnswer': 'Not reliably from a website alone. Your operating system, VPN, and router choose the route, and browsers cannot enumerate or bind requests to all physical interfaces. IPv4 and IPv6 can belong to the same line; several lines can also share one public IP. For a complete inventory, use your router’s WAN status or a local tool with explicit interface selection.',
  'faq.linesTip': 'For a simple check, switch the active connection and scan again without reloading this tab. We keep earlier observations labeled separately. Idle failover lines will usually stay invisible until activated.',
  'faq.detailsQuestion': 'What extra information can I see?',
  'faq.detailsAnswer': 'Expand an address to see its sources and first/last observation times. Optional lookup adds its network provider, ASN, and approximate location. Diagnostics show each request’s result and duration. Browser language, device timezone, and connection hints are shown separately so they are not mistaken for IP-derived facts.',
  'faq.privacyQuestion': 'What gets shared, and with whom?',
  'faq.privacyAnswer': 'Loading this page starts public IP checks against this site, ipify.org, and icanhazip.com. Like any contacted server, they receive the source IP and normal request metadata. We send no credentials, use no analytics, and store observations only in this tab’s memory by default. Saving IP data locally requires your explicit choice. External providers have their own retention policies.',
  'faq.privacyDetails': '“Look up details” sends the selected public IP to ipapi.co. WebRTC is off by default; enabling it contacts Google and Cloudflare STUN servers and may expose a route outside your VPN. It never requests your camera or microphone. Exported reports contain IP addresses; share them thoughtfully.',
  'footer.tagline': 'A little clarity for your corner of the internet.',
  'footer.api': 'JSON API',
  'toast.copied': 'IP address copied to clipboard.',
  'toast.clipboardUnavailable': 'Clipboard unavailable. Select the address and copy it manually.',
  'toast.exported': 'Report downloaded. It contains the observed IP addresses.',
  'source.server': 'This server',
  'source.dualStack': 'Dual stack',
  'error.privateAddress': 'Server sees a local/private address. Public services are checked separately.',
  'error.invalidPublicIp': 'The service did not return a valid public IP.',
  'error.expectedFamily': 'Expected an {family} address.',
  'error.http': 'HTTP {status}',
  'error.stopped': 'Check stopped.',
  'error.timeout': 'Timed out. This route or IP family may be unavailable.',
  'error.unreachable': 'Could not reach the service. Network, CORS, or a blocker may be responsible.',
  'error.checkFailed': 'Check failed. Try scanning again.',
  'error.webRtcUnsupported': 'WebRTC is not supported in this browser.',
  'error.noStunCandidate': 'No public STUN candidate was exposed. Browser privacy settings, UDP filtering, or routing may limit this check.',
  'error.webRtcFailed': 'WebRTC check failed.',
  'error.lookupPublicOnly': 'Only public IP addresses can be looked up.',
  'error.lookupHttp': 'Location lookup unavailable (HTTP {status}). Try again later.',
  'error.lookupInvalid': 'Location service returned an invalid response.',
  'error.lookupFailed': 'Location service could not look up this address. Try again later.',
  'error.lookupDifferent': 'Location service returned a different address.',
  'error.lookupTimeout': 'Lookup timed out. Please try again.',
  'error.lookupUnreachable': 'Location service unreachable or blocked. Please try again later.',
  'error.lookupUnavailable': 'Lookup unavailable. Please try again.',
  'error.unknown': 'The check could not be completed. Try again. Technical details: {detail}',
} satisfies Record<string, Message>

export type TranslationKey = keyof typeof en
export const de: Record<TranslationKey, Message> = {
  'document.title': 'whoami — Deine Verbindung, klar im Blick.',
  'document.description': 'Sieh die öffentlichen IP-Adressen, die dein Browser nutzt. Ein übersichtlicher Netzwerkcheck für mehrere Verbindungen mit IPv4, IPv6 und transparenter Diagnose.',
  'language.label': 'Sprache der Oberfläche',
  'language.english': 'Englisch',
  'language.german': 'Deutsch',
  'language.storageWarning': 'Deine Spracheinstellung konnte in diesem Browser nicht gelesen oder gespeichert werden. Du kannst die Sprache für diesen Besuch trotzdem wechseln.',
  'common.notProvided': 'Nicht angegeben',
  'common.notAvailable': 'Nicht verfügbar',
  'common.notExposed': 'Nicht offengelegt',
  'common.unavailable': 'Nicht verfügbar',
  'common.yes': 'Ja',
  'common.no': 'Nein',
  'common.observed': 'Erkannt',
  'common.checking': 'Wird geprüft',
  'common.notObserved': 'Nicht erkannt',
  'common.sources': { one: '{count} Quelle', other: '{count} Quellen' },
  'common.dismiss': 'Benachrichtigung schließen',
  'nav.skip': 'Zur Verbindungsübersicht springen',
  'nav.home': 'whoami Startseite',
  'nav.label': 'Hauptnavigation',
  'nav.overview': 'Übersicht',
  'nav.diagnostics': 'Diagnose',
  'nav.howItWorks': 'So funktioniert’s',
  'nav.privacy': 'Datenschutzhinweise',
  'nav.browserOnline': 'Browser online',
  'nav.browserOffline': 'Browser offline',
  'demo.title': 'Du erkundest eine Demo.',
  'demo.description': 'Das sind Beispieladressen, nicht dein Netzwerk.',
  'demo.provider': 'Beispielanbieter',
  'demo.asn': 'Beispiel-ASN',
  'demo.location': 'Beispielstandort (Demo)',
  'demo.timezone': 'Europe/Berlin (Beispiel)',
  'demo.address': 'Beispieladresse',
  'demo.explore': 'Demo erkunden',
  'demo.backToLive': 'Zurück zur Live-Ansicht',
  'page.offline': 'Dein Browser meldet, dass er offline ist. Stelle die Verbindung wieder her und prüfe erneut. Frühere Beobachtungen bleiben unten sichtbar.',
  'page.heading': 'Deine Verbindung, klar im Blick',
  'page.description': 'Alle öffentlichen IPs deines Browsers an einem Ort. Auch wenn es mehr als eine gibt.',
  'page.export': 'Bericht exportieren',
  'connection.overview': 'Verbindungsübersicht',
  'connection.observedPublic': 'Deine erkannte öffentliche {family}-Adresse',
  'connection.publicIp': 'Deine öffentliche IP-Adresse',
  'connection.showIps': 'IP-Adressen anzeigen',
  'connection.hideIps': 'IP-Adressen ausblenden',
  'connection.lookingUp': 'Deine IP wird gesucht…',
  'connection.notYetObserved': 'Noch nicht erkannt',
  'connection.copyPrimary': 'Primäre IP-Adresse kopieren',
  'connection.seenThisScan': 'In diesem Scan erkannt',
  'connection.confirmed': { one: '{count} Quelle bestätigt diese IP', other: '{count} Quellen bestätigen diese IP' },
  'connection.checkingDestinations': 'Unabhängige IPv4- und IPv6-Ziele werden geprüft.',
  'connection.tryAgain': 'Eine Route ist möglicherweise nicht verfügbar oder ein Dienst ist blockiert. Versuche es erneut.',
  'scan.running': 'Deine Routen werden geprüft…',
  'scan.stopped': 'Scan gestoppt',
  'scan.example': 'Beispielergebnisse',
  'scan.complete': 'Scan abgeschlossen',
  'scan.noPublicIp': 'Keine öffentliche IP erkannt',
  'scan.stop': 'Scan stoppen',
  'scan.checkConnection': 'Meine Verbindung prüfen',
  'scan.again': 'Erneut scannen',
  'scan.options': 'Scan-Optionen',
  'scan.deeper': 'Vertiefte Suche',
  'scan.deeperDescription': 'Drei zeitlich verteilte Runden über {count} Ziele in mehreren Netzen. Hilfreich bei Lastverteilung oder wechselnden Routen; dauert bis zu etwa 35 Sekunden. Erzwingt keine neue Verbindung.',
  'scan.includeWebRtc': 'WebRTC / STUN einbeziehen',
  'scan.optional': 'Optional',
  'scan.webRtcDescription': 'Kann eine IP außerhalb deines VPNs oder Proxys sichtbar machen. Kontaktiert STUN-Server von Google und Cloudflare. Kein Zugriff auf Kamera oder Mikrofon.',
  'scan.optionsHint': 'Die Optionen gelten für den nächsten Scan. Dein Browser und Router entscheiden weiterhin, welche Verbindungen genutzt werden.',
  'scan.addressesSummary': { one: 'öffentliche Adresse in diesem Scan', other: 'öffentliche Adressen in diesem Scan' },
  'scan.httpChecks': '{completed} / {planned} HTTP-Prüfungen',
  'scan.checked': 'Geprüft um {time}',
  'scan.ready': 'Bereit zum Prüfen',
  'diagram.label': { one: '{count} öffentliche Adresse von diesem Browser erkannt', other: '{count} öffentliche Adressen von diesem Browser erkannt' },
  'diagram.paths': 'Erkannte Routen',
  'diagram.notPhysical': 'KEINE PHYSISCHEN LEITUNGEN',
  'diagram.browser': 'Dein Browser',
  'diagram.visibility': 'Ein Blick. Mehr Überblick.',
  'diagram.publicFamily': 'Öffentliche {family}',
  'diagram.looking': 'Route wird gesucht',
  'diagram.noOther': 'Keine weitere Route erkannt',
  'diagram.evidence': { one: '{count} Quelle · Adresse {index}', other: '{count} Quellen · Adresse {index}' },
  'diagram.more': '+{count} weitere in der Liste unten',
  'address.label': 'Adresse {index}',
  'address.earlier': 'Früherer Scan',
  'address.previouslySeen': 'Zuvor erkannt',
  'address.observations': { one: '{count} Beobachtung', other: '{count} Beobachtungen' },
  'address.copy': 'Adresse kopieren',
  'address.copyNumber': 'Adresse {index} kopieren',
  'address.hideDetails': 'Details für Adresse {index} ausblenden',
  'address.showDetails': 'Details für Adresse {index} anzeigen',
  'address.firstSeen': 'Zuerst erkannt',
  'address.lastSeen': 'Zuletzt erkannt',
  'address.evidence': 'Nachweise',
  'address.distinctSources': { one: '{count} unabhängige Quelle', other: '{count} unabhängige Quellen' },
  'address.networkAsn': 'Netzwerk / ASN',
  'address.location': 'Ungefährer Standort',
  'address.timezone': 'Netzwerkzeitzone',
  'address.moreContext': 'Etwas mehr Kontext?',
  'address.lookupDescription': 'Ermittle Anbieter, ASN und ungefähren Standort. Dabei wird diese IP an ipapi.co gesendet; der Standort ist nicht GPS-genau.',
  'address.lookingUp': 'Details werden abgefragt…',
  'address.lookup': 'Details abfragen',
  'addresses.heading': 'Alle entdeckten Adressen',
  'addresses.description': 'Verschiedene Ziele können unterschiedliche Seiten deiner Verbindung sehen.',
  'addresses.about': 'Über mehrere Verbindungen',
  'addresses.filter': 'Adressen filtern',
  'addresses.all': 'Alle',
  'addresses.sessionNote': 'Beobachtungen dieses Tabs',
  'addresses.finding': 'Deine öffentlichen Adressen werden gesucht',
  'addresses.empty': 'Noch keine öffentlichen Adressen',
  'addresses.emptyFamily': 'Keine {family}-Adresse erkannt',
  'addresses.loadingHint': 'Jedes erreichbare Ziel fügt hier seine Beobachtung hinzu.',
  'addresses.emptyHint': 'Das bedeutet nicht, dass die Verbindung fehlt. Sieh in die Diagnose oder versuche eine vertiefte Suche.',
  'addresses.tryAgain': 'Erneut versuchen',
  'addresses.footnote': 'Standardmäßig nur in diesem Tab. Neuladen löscht den ungespeicherten Verlauf.',
  'addresses.multiTitle': 'Drei Leitungen bedeuten nicht immer drei sichtbare IPs.',
  'addresses.multiDescription': 'Ein Router oder VPN kann jede Anfrage über dieselbe Route senden. Versuche eine vertiefte Suche oder wechsle die aktive Verbindung und scanne erneut, um weitere Adressen zu sammeln.',
  'addresses.multiLink': 'Die Suche über mehrere Verbindungen verstehen',
  'environment.heading': 'Aus deinem Browser',
  'environment.connection': 'Verbindungsstatus',
  'environment.online': 'Online',
  'environment.offline': 'Offline',
  'environment.secure': 'Sicherer Kontext',
  'environment.language': 'Browsersprache',
  'environment.timezone': 'Gerätezeitzone',
  'environment.estimate': 'Netzwerkschätzung',
  'environment.disclaimer': 'Vom Browser gemeldet, kein Leitungsverzeichnis. Die Netzwerkschätzung beschreibt die effektive Geschwindigkeit, nicht ob du WLAN, Ethernet oder Mobilfunk nutzt.',
  'privacy.title': 'Dein Netzwerk. Deine Daten.',
  'privacy.summary': 'Keine Konten oder Analysen. Ergebnisse bleiben standardmäßig im Arbeitsspeicher. Öffentliche Prüfungen kontaktieren externe IP-Dienste.',
  'privacy.shared': 'Welche Daten geteilt werden',
  'diagnostics.heading': 'Hinter den Ergebnissen',
  'diagnostics.successes': { one: '{count} erfolgreiche Beobachtung', other: '{count} erfolgreiche Beobachtungen' },
  'diagnostics.unavailable': { one: '{count} Prüfung nicht verfügbar', other: '{count} Prüfungen nicht verfügbar' },
  'diagnostics.subtitle': 'Ergebnisse je Ziel und Anfragezeiten',
  'diagnostics.view': 'Diagnose anzeigen',
  'diagnostics.explanation': 'HTTP-Zeiten umfassen Verbindungsaufbau und Antwortzeit des Dienstes; sie sind keine Ping- oder Leitungsgeschwindigkeitsmessungen. Eine fehlgeschlagene IPv6-Prüfung beweist nicht, dass deinem Gerät IPv6 fehlt.',
  'diagnostics.destination': 'Ziel',
  'diagnostics.round': 'Durchlauf',
  'diagnostics.result': 'Ergebnis',
  'diagnostics.time': 'HTTP- / STUN-Zeit',
  'diagnostics.duration': '{duration} ms',
  'diagnostics.empty': 'Noch keine Prüfungen abgeschlossen.',
  'how.title': 'Ein umfassenderer Blick.',
  'how.subtitle': 'Keine Kristallkugel.',
  'how.description': 'Die meisten IP-Werkzeuge zeigen eine Antwort. whoami fragt mehrere Ziele und hält die unterschiedlichen Antworten zusammen.',
  'faq.discoveryQuestion': 'Wie findet ihr mehr als eine IP?',
  'faq.discoveryAnswer': 'Dein Browser kontaktiert diesen Server, ipify und icanhazip über IPv4-, IPv6- und Dual-Stack-Routen. Die vertiefte Suche ergänzt ident.me und ip4.me: drei zeitlich verteilte Runden über zehn Ziele. Wenn dein Router diese Anfragen auf verschiedene öffentliche Adressen verteilt, erscheinen sie hier einzeln. Der Browser kann Verbindungen wiederverwenden; wiederholte Anfragen garantieren keine neue Route.',
  'faq.discoveryStatic': 'Diese GitHub-Pages-Version kontaktiert ipify und icanhazip über IPv4-, IPv6- und Dual-Stack-Routen direkt aus deinem Browser. Die vertiefte Suche ergänzt ident.me und ip4.me: neun Ziele, drei zeitlich verteilte Runden. Unterschiedliche öffentliche Adressen erscheinen einzeln. Dein Browser kann Verbindungen wiederverwenden; dein Router entscheidet über die Route. Die Website ist statisch und bietet selbst keine serverseitige IP-API.',
  'faq.linesQuestion': 'Könnt ihr alle drei meiner Internetleitungen erkennen?',
  'faq.linesAnswer': 'Nicht zuverlässig allein über eine Website. Dein Betriebssystem, VPN und Router wählen die Route. Browser können nicht alle physischen Schnittstellen auflisten oder Anfragen an sie binden. IPv4 und IPv6 können zur selben Leitung gehören; mehrere Leitungen können sich auch eine öffentliche IP teilen. Für einen vollständigen Überblick nutze den WAN-Status deines Routers oder ein lokales Werkzeug mit gezielter Schnittstellenauswahl.',
  'faq.linesTip': 'Für einen einfachen Test wechsle die aktive Verbindung und scanne erneut, ohne diesen Tab neu zu laden. Frühere Beobachtungen bleiben gesondert gekennzeichnet. Inaktive Ersatzleitungen bleiben normalerweise unsichtbar, bis sie aktiviert werden.',
  'faq.detailsQuestion': 'Welche zusätzlichen Informationen kann ich sehen?',
  'faq.detailsAnswer': 'Klappe eine Adresse auf, um ihre Quellen sowie die erste und letzte Beobachtungszeit zu sehen. Eine optionale Abfrage ergänzt Netzwerkanbieter, ASN und ungefähren Standort. Die Diagnose zeigt Ergebnis und Dauer jeder Anfrage. Browsersprache, Gerätezeitzone und Verbindungshinweise werden separat angezeigt, damit sie nicht mit IP-basierten Fakten verwechselt werden.',
  'faq.privacyQuestion': 'Was wird geteilt und mit wem?',
  'faq.privacyAnswer': 'Beim Laden dieser Seite starten öffentliche IP-Prüfungen bei dieser Website, ipify.org und icanhazip.com. Wie jeder kontaktierte Server erhalten sie die Quell-IP und übliche Anfragemetadaten. Wir senden keine Zugangsdaten, nutzen keine Analysedienste und halten Beobachtungen standardmäßig nur im Arbeitsspeicher dieses Tabs. Das lokale Speichern von IP-Daten erfordert deine ausdrückliche Entscheidung. Externe Anbieter haben eigene Aufbewahrungsrichtlinien.',
  'faq.privacyDetails': '„Details abfragen“ sendet die ausgewählte öffentliche IP an ipapi.co. WebRTC ist standardmäßig ausgeschaltet; die Aktivierung kontaktiert STUN-Server von Google und Cloudflare und kann eine Route außerhalb deines VPNs offenlegen. Kamera oder Mikrofon werden nie angefordert. Exportierte Berichte enthalten IP-Adressen; teile sie mit Bedacht.',
  'footer.tagline': 'Etwas mehr Klarheit für deine Ecke des Internets.',
  'footer.api': 'JSON-API',
  'toast.copied': 'IP-Adresse in die Zwischenablage kopiert.',
  'toast.clipboardUnavailable': 'Zwischenablage nicht verfügbar. Markiere die Adresse und kopiere sie manuell.',
  'toast.exported': 'Bericht heruntergeladen. Er enthält die beobachteten IP-Adressen.',
  'source.server': 'Dieser Server',
  'source.dualStack': 'Dual-Stack',
  'error.privateAddress': 'Der Server sieht eine lokale/private Adresse. Öffentliche Dienste werden separat geprüft.',
  'error.invalidPublicIp': 'Der Dienst hat keine gültige öffentliche IP zurückgegeben.',
  'error.expectedFamily': 'Eine {family}-Adresse wurde erwartet.',
  'error.http': 'HTTP {status}',
  'error.stopped': 'Prüfung gestoppt.',
  'error.timeout': 'Zeitüberschreitung. Diese Route oder IP-Version ist möglicherweise nicht verfügbar.',
  'error.unreachable': 'Der Dienst war nicht erreichbar. Netzwerk, CORS oder ein Blocker könnten die Ursache sein.',
  'error.checkFailed': 'Prüfung fehlgeschlagen. Starte den Scan erneut.',
  'error.webRtcUnsupported': 'Dieser Browser unterstützt WebRTC nicht.',
  'error.noStunCandidate': 'Kein öffentlicher STUN-Kandidat wurde offengelegt. Datenschutzeinstellungen des Browsers, UDP-Filter oder Routing können diese Prüfung einschränken.',
  'error.webRtcFailed': 'WebRTC-Prüfung fehlgeschlagen.',
  'error.lookupPublicOnly': 'Nur öffentliche IP-Adressen können abgefragt werden.',
  'error.lookupHttp': 'Standortabfrage nicht verfügbar (HTTP {status}). Versuche es später erneut.',
  'error.lookupInvalid': 'Der Standortdienst hat eine ungültige Antwort zurückgegeben.',
  'error.lookupFailed': 'Der Standortdienst konnte diese Adresse nicht abfragen. Versuche es später erneut.',
  'error.lookupDifferent': 'Der Standortdienst hat eine andere Adresse zurückgegeben.',
  'error.lookupTimeout': 'Zeitüberschreitung bei der Abfrage. Bitte versuche es erneut.',
  'error.lookupUnreachable': 'Standortdienst nicht erreichbar oder blockiert. Bitte versuche es später erneut.',
  'error.lookupUnavailable': 'Abfrage nicht verfügbar. Bitte versuche es erneut.',
  'error.unknown': 'Die Prüfung konnte nicht abgeschlossen werden. Versuche es erneut. Technische Details: {detail}',
}

export const catalogs: Record<Language, Record<TranslationKey, Message>> = { en, de }

export function detectLanguage(languages: readonly string[] = []): Language {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0]
    if (base === 'en' || base === 'de') return base
  }
  return 'en'
}

export function readLanguagePreference(storage: Pick<Storage, 'getItem'> | null, languages: readonly string[]) {
  const detected = detectLanguage(languages)
  try {
    if (!storage) return { language: detected, storageWarning: true }
    const stored = storage.getItem(LANGUAGE_STORAGE_KEY)
    return { language: stored === 'en' || stored === 'de' ? stored : detected, storageWarning: false } as const
  } catch {
    return { language: detected, storageWarning: true }
  }
}

export function saveLanguagePreference(storage: Pick<Storage, 'setItem'> | null, language: Language): boolean {
  try {
    if (!storage) return false
    storage.setItem(LANGUAGE_STORAGE_KEY, language)
    return true
  } catch {
    return false
  }
}

const diagnosticKeys: TranslationKey[] = [
  'error.privateAddress', 'error.invalidPublicIp', 'error.stopped', 'error.timeout',
  'error.unreachable', 'error.checkFailed', 'error.webRtcUnsupported', 'error.noStunCandidate',
  'error.webRtcFailed', 'error.lookupPublicOnly', 'error.lookupInvalid', 'error.lookupFailed',
  'error.lookupDifferent', 'error.lookupTimeout', 'error.lookupUnreachable', 'error.lookupUnavailable',
]
const diagnosticMap = new Map(diagnosticKeys.map((key) => [en[key], key]))
type DateInput = string | number | Date

/** Pure locale-bound formatters; pass raw source/error strings, never already translated UI text. */
export function createI18n(language: Language) {
  const locale = locales[language]
  const pluralRules = new Intl.PluralRules(locale)
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
    Number.isFinite(value) ? new Intl.NumberFormat(locale, options).format(value) : catalogs[language]['common.notAvailable'] as string
  const t = (key: TranslationKey, values: Interpolation = {}): string => {
    const message = catalogs[language][key]
    const template = typeof message === 'string' ? message
      : typeof values.count === 'number' && pluralRules.select(values.count) === 'one' ? message.one : message.other
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = values[name]
      return typeof value === 'number' ? formatNumber(value) : value ?? placeholder
    })
  }
  const formatDate = (value: DateInput, options: Intl.DateTimeFormatOptions) => {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, options).format(date) : t('common.notAvailable')
  }
  const formatTime = (value: DateInput, options?: Intl.DateTimeFormatOptions) =>
    formatDate(value, { hour: '2-digit', minute: '2-digit', second: '2-digit', ...options })
  const formatDateTime = (value: DateInput, options?: Intl.DateTimeFormatOptions) =>
    formatDate(value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', ...options })
  const formatSource = (source: string) => source === 'WebRTC · Device candidate' ? reliabilityText(language, 'candidateSource')
    : source === 'This server' ? t('source.server')
    : source === 'Dual stack' ? t('source.dualStack')
      : source.endsWith(' · Dual stack') ? `${source.slice(0, -'Dual stack'.length)}${t('source.dualStack')}` : source
  const formatDiagnostic = (message?: string): string => {
    if (!message) return ''
    if (message === 'Rate limited earlier in this scan. Further requests to this destination were skipped.') return reliabilityText(language, 'rateLimitedLocalized')
    const key = diagnosticMap.get(message)
    if (key) return t(key)
    const http = /^HTTP (\d{3})$/.exec(message)
    if (http) return t('error.http', { status: http[1] })
    const family = /^Expected an (IPv[46]) address\.$/.exec(message)
    if (family) return t('error.expectedFamily', { family: family[1] })
    const lookup = /^Location lookup unavailable \(HTTP (\d{3})\)\. Try again later\.$/.exec(message)
    if (lookup) return t('error.lookupHttp', { status: lookup[1] })
    return t('error.unknown', { detail: message })
  }
  return { language, t, formatTime, formatDateTime, formatNumber, formatSource, formatDiagnostic }
}

/** Only language is persisted; a failed preference read/write is exposed for a visible translated alert. */
export type I18n = ReturnType<typeof createI18n> & {
  setLanguage: (language: Language) => void
  storageWarning: boolean
}
const I18nContext = createContext<I18n | null>(null)

function initialPreference() {
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  try {
    return readLanguagePreference(typeof window === 'undefined' ? null : window.localStorage, languages)
  } catch {
    return { language: detectLanguage(languages), storageWarning: true }
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(initialPreference)
  const formatters = useMemo(() => createI18n(preference.language), [preference.language])
  const setLanguage = useCallback((language: Language) => {
    let saved = false
    try { saved = saveLanguagePreference(window.localStorage, language) } catch { /* Accessing storage itself can be denied. */ }
    setPreference({ language, storageWarning: !saved })
  }, [])
  useEffect(() => {
    document.documentElement.lang = preference.language
    document.title = formatters.t('document.title')
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) {
      description = document.createElement('meta')
      description.name = 'description'
      document.head.append(description)
    }
    description.content = formatters.t('document.description')
  }, [formatters, preference.language])
  const value = useMemo(() => ({ ...formatters, setLanguage, storageWarning: preference.storageWarning }), [formatters, setLanguage, preference.storageWarning])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
