
const salesData = [
  { product: "Laptop", amount: 50000 },
  { product: "Mouse", amount: 2000 },
  { product: "Keyboard", amount: 8000 },
  { product: "Monitor", amount: 30000 }
];

// Tool 1: Calculate total sales
export function calculateTotal() {
  const total = salesData.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  return {
    total,
    records: salesData.length
  };
}

// Tool 2: Find highest sale
export function findHighestSale() {
  return salesData.reduce((highest, item) =>
    item.amount > highest.amount ? item : highest
  );
}
