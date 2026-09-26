/* ==========================================================================
   TRAZA · APP_CONFIG — datos del equipo y de integraciones (§13.1, §12.4)
   Esta es la única sección que hay que editar para personalizar la entrega.
   ========================================================================== */
(function (root) {
  'use strict';

  var APP_CONFIG = {
    appName: 'TRAZA',
    tagline: 'Las finanzas con claridad.',
    version: '1.0.0',
    course: 'Ingeniería Económica',

    /* Integrantes, tal como los proporcionó el equipo. */
    teamMembers: [
      'Stephy Batiuk',
      'Daniela Vidal',
      'Diego Estevez',
      'Juan Montero',
      'Juan Berrizbeitia',
      'Juan Rafael',
    ],
    /* Roles opcionales: { 'Nombre': 'Rol' }. Vacío porque no se proporcionaron. */
    memberRoles: {},

    /* Contacto que aparece en el reverso de la tarjeta de créditos y en el PDF. */
    coordinatorName: 'Juan Berrizbeitia',
    coordinatorEmail: 'jeberrizbeitia.25@est.ucab.edu.ve',

    /* Reporte externo de Power BI: desactivado. Solo habilitar con una URL de
       inserción real (https://app.powerbi.com/...) y acceso válido del equipo.
       Nunca incluir tokens, claves ni credenciales en este archivo. */
    powerBI: {
      enabled: false,
      embedUrl: '',
      reportUrl: '',
      title: '',
      datasetNote: '',
    },
  };

  root.TRAZA = root.TRAZA || {};
  root.TRAZA.config = APP_CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
