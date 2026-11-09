import { defineMessages } from "../core";

// "Guide" panel: how gates, ticket types, users and tills fit together.
export default defineMessages({
  fr: {
    "guide.button": "Guide",
    "guide.title": "Portes, billets, utilisateurs et caisses",
    "guide.intro":
      "Tout s'organise autour de la porte : une caisse appartient à une porte, un caissier travaille à une porte, et un billet n'est valable qu'à la porte qui l'a vendu.",
    "guide.youAreHere": "Vous êtes ici",
    "guide.open": "Ouvrir",
    "guide.step": "Étape {n}",

    "guide.gates.title": "Créer les portes",
    "guide.gates.where": "Portes & caisses",
    "guide.gates.body":
      "Un nom suffit (le code est proposé). Chaque porte reçoit sa propre clé qui signe les QR codes de ses billets : un billet vendu à une porte n'est pas accepté à une autre. Ensuite, sur la carte de la porte : « Ajouter un caissier » et « Enrôler une caisse ».",

    "guide.ticketTypes.title": "Créer les types de billets",
    "guide.ticketTypes.where": "Billetterie",
    "guide.ticketTypes.body":
      "Un type créé pour « toutes les portes » sert à chaque nouvelle porte, sans rien refaire. Choisissez une porte seulement pour un billet vendu là uniquement. Le billet vendu n'est valable qu'à la porte qui l'a vendu.",

    "guide.users.title": "Créer les utilisateurs et leur porte",
    "guide.users.where": "Utilisateurs",
    "guide.users.body": "Le rôle et la porte décident où chacun peut travailler :",
    "guide.users.cashier": "Caissier — porte obligatoire. Vend et scanne, uniquement sur les caisses de sa porte.",
    "guide.users.coordinator":
      "Coordonnateur — porte facultative. Supervise (ventes, annulations) ; avec une porte, peut aussi tenir ses caisses.",
    "guide.users.admin": "Super administrateur — aucune porte. Administration web uniquement ; jamais enregistré sur une caisse.",

    "guide.devices.title": "Enrôler les caisses",
    "guide.devices.where": "Appareils",
    "guide.devices.body1":
      "Sur la porte, « Enrôler une caisse » affiche un code (valable 30 minutes, une seule fois). Le nom est facultatif : « Caisse n° 1 », « n° 2 »…",
    "guide.devices.body2": "Sur la caisse : installer l'application, « Enrôler cette caisse », saisir le code.",
    "guide.devices.body3":
      "En deux secondes, la caisse reçoit d'elle-même les billets et prix de sa porte, le design du billet et du reçu, et les caissiers de sa porte — qui peuvent s'y connecter même sans internet.",

    "guide.result":
      "Résultat : un caissier se connecte sur n'importe quelle caisse de sa porte, même hors-ligne et même s'il n'y est jamais venu. Sur la caisse d'une autre porte, il est refusé.",

    "guide.changes.title": "Les changements du quotidien, appliqués en direct",
    "guide.changes.action": "Vous faites…",
    "guide.changes.effect": "Effet sur les caisses",
    "guide.changes.price": "Changer un prix ou un type de billet",
    "guide.changes.priceEffect": "Les caisses de la porte sont à jour en moins d'une seconde.",
    "guide.changes.newCashier": "Créer un caissier",
    "guide.changes.newCashierEffect": "Il peut se connecter sur toutes les caisses de sa porte, hors-ligne compris.",
    "guide.changes.disable": "Désactiver un caissier ou changer son mot de passe",
    "guide.changes.disableEffect":
      "Appliqué sur les caisses dès qu'elles sont en ligne ; une caisse restée hors-ligne garde l'ancien état jusqu'à sa reconnexion.",
    "guide.changes.move": "Changer la porte d'un caissier",
    "guide.changes.moveEffect": "Il disparaît des caisses de l'ancienne porte et apparaît sur celles de la nouvelle.",
    "guide.changes.void": "Annuler une vente",
    "guide.changes.voidEffect": "Ses billets sont refusés au scan sur toutes les caisses de la porte.",
    "guide.changes.revoke": "Révoquer une caisse (volée, en panne)",
    "guide.changes.revokeEffect": "Déconnectée immédiatement, elle ne peut plus se synchroniser. Ses ventes déjà envoyées restent.",

    "guide.rules.title": "À retenir",
    "guide.rules.moveTill":
      "Pour changer une caisse de porte : la révoquer, puis l'enrôler à nouveau avec un code de la nouvelle porte. Une caisse ne change jamais de porte en silence.",
    "guide.rules.severalTills":
      "Plusieurs caisses par porte : en ligne, elles apprennent en direct les ventes et scans des autres — un billet déjà utilisé est refusé à l'autre caisse.",
    "guide.rules.browserTills":
      "Les caisses navigateur (sans enrôlement) restent utilisables pour tout caissier affecté à une porte, mais sans la synchronisation en direct entre caisses.",
  },
  en: {
    "guide.button": "Guide",
    "guide.title": "Gates, tickets, users and tills",
    "guide.intro":
      "Everything is organised around the gate: a till belongs to one gate, a cashier works at one gate, and a ticket is only valid at the gate that sold it.",
    "guide.youAreHere": "You are here",
    "guide.open": "Open",
    "guide.step": "Step {n}",

    "guide.gates.title": "Create the gates",
    "guide.gates.where": "Gates & tills",
    "guide.gates.body":
      'A name is enough (the code is suggested). Each gate gets its own key that signs its tickets\' QR codes: a ticket sold at one gate is not accepted at another. Then, on the gate\'s card: "Add a cashier" and "Enroll a till".',

    "guide.ticketTypes.title": "Create the ticket types",
    "guide.ticketTypes.where": "Tickets",
    "guide.ticketTypes.body":
      'A type made for "all gates" serves every new gate with nothing to redo. Pick one gate only for a ticket sold there alone. A ticket sold is only valid at the gate that sold it.',

    "guide.users.title": "Create the users and their gate",
    "guide.users.where": "Users",
    "guide.users.body": "The role and the gate decide where each person can work:",
    "guide.users.cashier": "Cashier — gate required. Sells and scans, only on the tills of their gate.",
    "guide.users.coordinator": "Coordinator — gate optional. Supervises (sales, voids); with a gate, can also work its tills.",
    "guide.users.admin": "Super administrator — no gate. Web administration only; never stored on a till.",

    "guide.devices.title": "Enroll the tills",
    "guide.devices.where": "Devices",
    "guide.devices.body1":
      'On the gate, "Enroll a till" shows a code (valid 30 minutes, once). The name is optional: "Till no. 1", "no. 2"…',
    "guide.devices.body2": 'On the till: install the app, "Enroll this till", type the code.',
    "guide.devices.body3":
      "Within two seconds the till receives its gate's tickets and prices, the ticket and receipt design, and its gate's cashiers — who can sign in there even without internet.",

    "guide.result":
      "Result: a cashier signs in on any till of their gate, even offline and even if they never used it before. On another gate's till, they are refused.",

    "guide.changes.title": "Day-to-day changes, applied live",
    "guide.changes.action": "You do…",
    "guide.changes.effect": "Effect on the tills",
    "guide.changes.price": "Change a price or a ticket type",
    "guide.changes.priceEffect": "The gate's tills are up to date in under a second.",
    "guide.changes.newCashier": "Create a cashier",
    "guide.changes.newCashierEffect": "They can sign in on every till of their gate, offline included.",
    "guide.changes.disable": "Deactivate a cashier or change their password",
    "guide.changes.disableEffect":
      "Applied on the tills as soon as they are online; a till that stays offline keeps the old state until it reconnects.",
    "guide.changes.move": "Move a cashier to another gate",
    "guide.changes.moveEffect": "They disappear from the old gate's tills and appear on the new one's.",
    "guide.changes.void": "Void a sale",
    "guide.changes.voidEffect": "Its tickets are refused at scan on every till of the gate.",
    "guide.changes.revoke": "Revoke a till (stolen, broken)",
    "guide.changes.revokeEffect": "Disconnected at once, it can no longer sync. Sales it already sent stay.",

    "guide.rules.title": "Keep in mind",
    "guide.rules.moveTill":
      "To move a till to another gate: revoke it, then enroll it again with a code for the new gate. A till never changes gate silently.",
    "guide.rules.severalTills":
      "Several tills per gate: when online, they learn each other's sales and scans live — a ticket already used is refused at the other till.",
    "guide.rules.browserTills":
      "Browser tills (no enrollment) still work for any cashier assigned to a gate, but without the live sync between tills.",
  },
});
