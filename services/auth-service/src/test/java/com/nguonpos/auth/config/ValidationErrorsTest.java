package com.nguonpos.auth.config;

import com.nguonpos.auth.user.Role;
import com.nguonpos.auth.user.UserAdminController.CreateRequest;
import org.junit.jupiter.api.Test;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class ValidationErrorsTest {

    private BeanPropertyBindingResult validate(CreateRequest request) {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        BeanPropertyBindingResult result = new BeanPropertyBindingResult(request, "createRequest");
        validator.validate(request, result);
        validator.close();
        return result;
    }

    @Test
    void aShortPasswordSaysHowLongItMustBe() {
        var result = validate(new CreateRequest("caisse1", "abc", "Awa Njoya", Role.CASHIER, null, null));
        assertEquals("Mot de passe : 4 caractères minimum.", ValidationErrors.describe(result.getFieldError("password"), false));
        assertEquals("Password : 4 characters minimum.", ValidationErrors.describe(result.getFieldError("password"), true));
    }

    @Test
    void lettersAreAcceptedLikeDigits() {
        assertFalse(validate(new CreateRequest("caisse1", "abcd", "Awa Njoya", Role.CASHIER, null, null)).hasErrors());
        assertFalse(validate(new CreateRequest("caisse1", "1234", "Awa Njoya", Role.CASHIER, null, null)).hasErrors());
    }

    @Test
    void aMissingFieldIsNamed() {
        var result = validate(new CreateRequest("caisse1", "abcd", " ", Role.CASHIER, null, null));
        assertEquals("Nom complet : obligatoire.", ValidationErrors.describe(result.getFieldError("fullName"), false));
    }
}
