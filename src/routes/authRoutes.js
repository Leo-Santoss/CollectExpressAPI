const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const validationMiddleware = require("../middlewares/validationMiddleware");
const { rateLimitMiddleware } = require("../middlewares/rateLimitMiddleware");

// Schema de validação para registro
const registerSchema = {
  nome_completo: {
    required: true,
    type: "string",
    minLength: 3,
    maxLength: 150
  },
  email: {
    required: true,
    type: "string",
    format: "email",
    maxLength: 255
  },
  senha: {
    required: true,
    type: "string",
    minLength: 8,
    maxLength: 128,
    custom: (value) => {
      const hasUppercase = /[A-Z]/.test(value);
      const hasLowercase = /[a-z]/.test(value);
      const hasDigit = /\d/.test(value);
      if (!hasUppercase || !hasLowercase || !hasDigit) {
        return "A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um dígito";
      }
      return true;
    }
  },
  tipo_perfil: {
    required: true,
    type: "string",
    custom: (value) => {
      if (value !== "CONSUMIDOR" && value !== "CACAMBEIRO") {
        return "O tipo de perfil deve ser 'CONSUMIDOR' ou 'CACAMBEIRO'";
      }
      return true;
    }
  },
  documento: {
    required: true,
    type: "string",
    format: "digits",
    custom: (value) => {
      if (value.length !== 11 && value.length !== 14) {
        return "Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos";
      }
      return true;
    }
  },
  telefone: {
    required: true,
    type: "string",
    format: "digits",
    minLength: 10,
    maxLength: 11
  }
};

/**
 * Middleware adicional para validar campos de CACAMBEIRO.
 * Executado após a validação base, verifica campos de negócio quando tipo_perfil === 'CACAMBEIRO'.
 */
function validateCacambeiroDetails(req, res, next) {
  if (req.body.tipo_perfil !== "CACAMBEIRO") {
    return next();
  }

  const { horario_inicio, horario_fim, raio_entrega_km, taxa_entrega } = req.body;
  const erros = [];
  const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

  // horario_inicio
  if (!horario_inicio || typeof horario_inicio !== "string") {
    erros.push({ campo: "horario_inicio", mensagem: "O campo 'horario_inicio' é obrigatório" });
  } else if (!TIME_REGEX.test(horario_inicio)) {
    erros.push({ campo: "horario_inicio", mensagem: "O campo 'horario_inicio' deve estar no formato HH:MM (00:00-23:59)" });
  }

  // horario_fim
  if (!horario_fim || typeof horario_fim !== "string") {
    erros.push({ campo: "horario_fim", mensagem: "O campo 'horario_fim' é obrigatório" });
  } else if (!TIME_REGEX.test(horario_fim)) {
    erros.push({ campo: "horario_fim", mensagem: "O campo 'horario_fim' deve estar no formato HH:MM (00:00-23:59)" });
  } else if (horario_inicio && TIME_REGEX.test(horario_inicio) && horario_fim <= horario_inicio) {
    erros.push({ campo: "horario_fim", mensagem: "O campo 'horario_fim' deve ser posterior a 'horario_inicio'" });
  }

  // raio_entrega_km
  if (raio_entrega_km === undefined || raio_entrega_km === null) {
    erros.push({ campo: "raio_entrega_km", mensagem: "O campo 'raio_entrega_km' é obrigatório" });
  } else if (typeof raio_entrega_km !== "number" || isNaN(raio_entrega_km)) {
    erros.push({ campo: "raio_entrega_km", mensagem: "O campo 'raio_entrega_km' deve ser do tipo 'number'" });
  } else if (raio_entrega_km < 1 || raio_entrega_km > 200) {
    erros.push({ campo: "raio_entrega_km", mensagem: "O campo 'raio_entrega_km' deve ser entre 1 e 200" });
  }

  // taxa_entrega
  if (taxa_entrega === undefined || taxa_entrega === null) {
    erros.push({ campo: "taxa_entrega", mensagem: "O campo 'taxa_entrega' é obrigatório" });
  } else if (typeof taxa_entrega !== "number" || isNaN(taxa_entrega)) {
    erros.push({ campo: "taxa_entrega", mensagem: "O campo 'taxa_entrega' deve ser do tipo 'number'" });
  } else if (taxa_entrega < 0.01 || taxa_entrega > 99999.99) {
    erros.push({ campo: "taxa_entrega", mensagem: "O campo 'taxa_entrega' deve ser entre 0.01 e 99999.99" });
  }

  if (erros.length > 0) {
    return res.status(400).json({ errors: erros });
  }

  return next();
}

// Schema de validação para login
const loginSchema = {
  email: {
    required: true,
    type: "string",
    format: "email"
  },
  senha: {
    required: true,
    type: "string",
    minLength: 6,
    maxLength: 128
  }
};

// Schema de validação para forgot-password
const forgotPasswordSchema = {
  email: {
    required: true,
    type: "string",
    format: "email"
  }
};

// Schema de validação para reset-password
const resetPasswordSchema = {
  token: {
    required: true,
    type: "string"
  },
  nova_senha: {
    required: true,
    type: "string",
    minLength: 8,
    maxLength: 128
  }
};

// Rotas públicas
router.post(
  "/register",
  validationMiddleware(registerSchema),
  validateCacambeiroDetails,
  authController.register
);

router.post(
  "/login",
  rateLimitMiddleware,
  validationMiddleware(loginSchema),
  authController.login
);

router.post(
  "/forgot-password",
  validationMiddleware(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  validationMiddleware(resetPasswordSchema),
  authController.resetPassword
);

module.exports = router;
