# Additions
Vérification d'opérations mathématiques dans un cahier de labo

## Généralité
Application web destinée à être utilisée sur un téléphone dans le navigateur.

## Fonctionnement
A partir de l'application, l'utilisateur utilise la caméra pour prendre en photo une section contenant des opérations écrite manuellement. Il dispose d'un moyen d'indiquer la partie de la photo à exploiter (cadre ou rognage). L'application reconnait le type de section, les opérations à effectuer, effecture le calcul et indique : 
-  les résultats des opérations
- si le résultat est identique ou non au résultat obtenu par celui qui a posé l'opération manuellement, opération par opérations

On distingue 4 types de section, voir les 4 exemples

Pour faciliter l'utilisation quand la reconnaissance n'a pas été parfaite, il faudrait créer une interface de rendu avec un tableau contenant les nombrs décodés, les opérateurs décodés, et le résultat décodé / calculé (indicateur visuel OK/KO). Ce tableau serait interactif pour que l'utilisateur puisse modifier un nombre mal décodé ou un opérateur mal décodé, le tableau se recalcule alors automatiquement.

## exemples
cas 1 :  ![opération_distribuée](./mass_operation.png) : chaque valeur A, B, .. à droite est calculée en appliquant. l'opération au mileu aux valeurs A, B, .. à gauche
par exemple pour B : 1.8 * 0.01 = 0.018

cas 2 : ![opération_en_vecteur](./multi_calcul.png) : chaque ligne est une opération, l'opérateur à appliquer est indiqué entre les colonnes. Toutes les colonnes doivent être prises en comptes. Dans certains cas les chiffres sont imprimés et non manuscrits. L'opérateur est obligatoirement parmis + - x ÷
par exemple pour B : 1.5 - 0.150 - 0.300 - 0.0035 = 1.050 
NOTE: le résultat exact est 1.0465, l'arrondi 1.050 est valide, on autorise les arrondis à l'unité la plus proche pour tous les cas
[Autre exemple de cas 2](./autre_cas2.jpeg)
Il est possible qu'il existe des parenthèse modifiant l'opération : 
[encore un autre exemple](./autre_cas2_B.jpeg)
par exemple ligne C. : (34,97 / 1.5) * 0.8 = 18,651

[avec parenthèse](./cas_2_avec_parentheses.jpeg)  ligne A : (0.035 + 19,600) * 1.13 = 22.19

cas 3 : 
 [yield](./yeld_operation.png)  La colonne calculée est le yield obtenu en multipliant le volume par la concentration 
 pas exemple pour C : 0,4940 mg/Ml * 0,522 Ml = 0,258 mg (arrondi correct).

cas 4 :
[mooyenne](./average.jpeg) La colonne "Average" contient la moyenne de la ligne
Par exemple pour Batch B, A260/280 : (1,93 + 1,91 + 1,92 ) / 3 = 1,92

## contrainte impérative
Doit fonctionner avec le navigateur safari sous iOS

## objectifs (si possible)
l'application tourne entièrement dans le navigateur (pas de backend)
l'application est hébergée en github pages.

## Structure
Séparer les fichiers CSS, JS et HTML afin d'obtenir un code lisible et répondant aux standard actuels

## Planification
Analyse les spécifications ci-dessus. Identifie les technologies à utiliser (librairie, language, structure) pour y répondre.
Analyse les possibilités de répondre aux différents objectifs, explique pour chacun ce qui est possible ou non. 
