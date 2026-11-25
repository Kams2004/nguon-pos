# Guide de l'administrateur — Nguon POS

Pour les super administrateurs et coordinateurs. L'administration se fait dans le navigateur : **https://pos.nguonevents.com** (même page de connexion que les caisses).

## 1. Mettre en place une porte (avant le festival)

Tout se fait depuis **Portes & caisses**, porte par porte.

1. **Nouvelle porte** : donnez un nom (le code est proposé). Chaque porte reçoit sa propre clé qui signe ses QR codes : un billet vendu à une porte n'entre pas par une autre.
2. **Billets** (menu **Billetterie**) : un type de billet créé pour « toutes les portes » sert à chaque porte. Choisissez une porte seulement pour un billet vendu là uniquement.
3. **Utilisateurs → Nouvel utilisateur** : nom, identifiant, mot de passe (bouton œil pour l'afficher et le communiquer). Pas de porte à choisir : chacun peut travailler à toutes les portes, c'est la caisse sur laquelle il se connecte qui décide.
4. **Enrôler une caisse** (sur la carte de la porte) :
   1. Sur l'ordinateur de la caisse, installez Nguon POS (lien de téléchargement Windows ou Ubuntu fourni par l'équipe technique).
   2. Dans l'administration, cliquez **Enrôler une caisse**, nommez-la (« Caisse n° 1 » est proposé), puis **Générer un code**.
   3. Sur la caisse, cliquez **Enrôler cette caisse** et saisissez le code. Il est valable 30 minutes, une seule fois.
   4. La caisse apparaît sous la porte, avec son état. Sur l'écran de connexion de la caisse s'affichent son nom et sa porte.

Branchez les caisses d'une même porte sur **le même routeur / Wi-Fi** : elles se synchronisent entre elles même sans internet.

## 2. Pendant le festival

| Où | Ce que vous y voyez |
|---|---|
| **Tableau de bord** | Ventes et entrées en direct. |
| **Portes & caisses** | Pour chaque porte : ses caisses (en ligne ou non, **qui est connecté** sur chacune en ce moment, ventes en attente d'envoi). |
| **Caisses en direct** | Toutes les caisses, filtrables (hors ligne, ventes en attente). |
| **Contrôle des entrées** | Tous les scans. Le filtre **Doubles entrées** montre les billets admis deux fois par deux caisses coupées l'une de l'autre. |
| **Ventes** | Recherche d'une vente ; **annulation** (ses billets seront refusés à l'entrée sur toutes les caisses de la porte). |
| **Journal d'activité** | Qui a fait quoi, et quand. |

Une caisse **hors ligne** continue de vendre et de contrôler. Ses ventes arrivent dès qu'elle retrouve internet ; rien n'est à ressaisir.

## 3. Situations courantes

| Situation | Que faire |
|---|---|
| Savoir où travaille quelqu'un | En direct : **Utilisateurs** (colonne « En ce moment ») ou **Portes & caisses**. Pour un jour passé : **Caisses en direct → Historique des connexions** (porte, caisse, heures). Ses ventes par porte : **Rapports → Caissiers par porte**. |
| Caissier qui part / mot de passe compromis | **Utilisateurs** → désactiver le compte ou changer le mot de passe. |
| Caisse volée, perdue ou remplacée | **Portes & caisses** → bouclier sur la caisse → **Révoquer** : elle est coupée immédiatement et les autres caisses la refusent. Pour en mettre une autre : **Enrôler une caisse**. |
| Changer une caisse de porte | La **révoquer** (le caissier connecté est déconnecté aussitôt), puis créer un code pour la nouvelle porte (**Enrôler une caisse**). Sur la caisse, l'écran de connexion propose **Réenrôler cette caisse** : saisir le code. La même porte marche aussi. |
| Un code d'enrôlement n'a pas servi | Sur la carte de la porte, la ligne « Code émis » → **✕** pour l'annuler. |
| Un caissier signale un problème | Demandez-lui le fichier du bouton **Support → Enregistrer le diagnostic** et transmettez-le à l'équipe technique. |

## 4. Mises à jour des caisses

Menu **Mises à jour** → **Versions des caisses**.

- **Publier aux caisses** sur une version : chaque caisse la télécharge, vérifie sa signature et l'installe d'elle-même **quand personne ne l'utilise** (15 minutes sans activité). Ventes et réglages sont conservés.
- **Geler** : plus aucune mise à jour. **À faire pendant le festival**, sauf correctif urgent demandé par l'équipe technique.
- La colonne **Caisses** indique combien de caisses ont déjà chaque version. Le tableau en dessous donne la version, le système et le certificat de chacune.

## 5. Sécurité — à respecter

- Un compte par personne ; ne partagez pas les mots de passe. Changez celui du compte `admin` livré au départ.
- Ne donnez les droits **super administrateur** qu'aux responsables.
- Révoquez sans attendre une caisse perdue ou volée.
