import type { LoaderFunctionArgs } from "react-router";

const SAMPLE_CSV = `Product name,sku,replace with sku,quantity
Classic Cotton T-Shirt,TSHIRT-BLK-M,,2
Denim Jacket,JKT-BLU-L,JKT-BLU-XL,1
Running Shoes,SHOE-WHT-10,,3
Baseball Cap,CAP-RED-OS,CAP-BLK-OS,1
`;

export async function loader({ request }: LoaderFunctionArgs) {
  return new Response(SAMPLE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sample_order_bulk_update.csv"',
      "Access-Control-Allow-Origin": "*",
    },
  });
}
