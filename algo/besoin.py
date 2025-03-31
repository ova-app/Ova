# besoin.py
# Methode de calcul : Mifflin-St Jeor

def calcul_bmr(utilisateur):
    if utilisateur.sexe.lower() == "homme":
        return 10 * utilisateur.poids + 6.25 * utilisateur.taille - 5 * utilisateur.age + 5
    elif utilisateur.sexe.lower() == "femme":
        return 10 * utilisateur.poids + 6.25 * utilisateur.taille - 5 * utilisateur.age - 161
    else:
        raise ValueError("Sexe invalide (doit être 'homme' ou 'femme')")


def calcul_tdee(utilisateur):
    bmr = calcul_bmr(utilisateur)
    return bmr * utilisateur.activite

