export const marketLabels = {
  arg_stocks: "Acciones argentinas",
  arg_cedears: "CEDEARs",
  arg_bonds: "Bonos soberanos y provinciales",
  arg_notes: "Letras y notes",
  arg_options: "Opciones"
};

export const typeLabels = {
  lecap: "Tasa fija",
  cer: "CER",
  tamar: "TAMAR",
  dual: "Dual",
  dolar_linked: "Dólar linked",
  hard_dollar: "Dólar hard",
  otros: "Otros"
};

export const typeColors = {
  lecap: "#2f6fb2",
  cer: "#d89a00",
  tamar: "#7b4aae",
  dual: "#bf3b3b",
  dolar_linked: "#007f79",
  hard_dollar: "#18825c",
  otros: "#66717a"
};

export const debtFamilyLabels = {
  fixed_rate: "Tasa fija",
  inflation: "Ajusta por inflación",
  floating_rate: "Tasa variable",
  dual: "Dual o mixta",
  dollar_linked: "Atada al dólar oficial",
  hard_dollar: "En dólares",
  other: "Otros"
};

export const debtFamilyColors = {
  fixed_rate: "#4aa3ff",
  inflation: "#f2b84b",
  floating_rate: "#a982ff",
  dual: "#ff6b6b",
  dollar_linked: "#1fc6b5",
  hard_dollar: "#4ad080",
  other: "#8a98a6"
};

export const instrumentDefinitions = {
  lecap: {
    title: "LECAP",
    short: "Letra capitalizable en pesos",
    text: "Paga una tasa fija implícita y capitaliza intereses hasta el vencimiento. Es la parte más simple de leer: se sabe la tasa en pesos desde el inicio."
  },
  cer: {
    title: "CER",
    short: "Ajusta por inflación",
    text: "El capital se actualiza por CER, que sigue al IPC. Protege contra inflación, aunque el precio también se mueve por tasas y expectativas."
  },
  tamar: {
    title: "TAMAR",
    short: "Tasa variable bancaria",
    text: "Paga una tasa que cambia con una referencia mayorista bancaria. Sirve cuando el mercado no quiere quedar clavado en una tasa fija."
  },
  dual: {
    title: "Dual",
    short: "Combina coberturas",
    text: "Suele pagar según la mejor de dos referencias definidas en la emisión, por ejemplo inflación o tipo de cambio. Es una forma de comprar seguro contra escenarios distintos."
  },
  dolar_linked: {
    title: "Dólar linked",
    short: "Paga en pesos, sigue dólar oficial",
    text: "No entrega dólares: paga pesos ajustados por la evolución del tipo de cambio oficial. Se usa para cubrir riesgo de devaluación oficial."
  },
  hard_dollar: {
    title: "Bono hard dollar",
    short: "Deuda en dólares",
    text: "El flujo está denominado en dólares. Para el Tesoro implica compromiso en moneda dura y para el inversor cambia el riesgo principal."
  },
  otros: {
    title: "Otros",
    short: "Instrumentos no clasificados",
    text: "Agrupa instrumentos que no entran en las familias anteriores o que llegan con poca información de clasificación."
  }
};
