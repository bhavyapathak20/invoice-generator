import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import ExcelJs from "exceljs";
import bcrypt from "bcrypt";
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


const port = process.env.PORT || 3000;


const db = new pg.Client({
    connectionString: 'postgresql://postgres:HUdYoiqyEXtmLOdATezjqAqoGtUWhMoN@yamanote.proxy.rlwy.net:14803/railway',
    ssl: {
        rejectUnauthorized: false
    }
})
let currentOTP = null;
const saltRounds = 2;

db.connect();

app.use(express.static("public"))
app.use(bodyParser.urlencoded({extended: true}));

                            

app.get("/", (req,res) =>{
    // res.redirect("/new-invoice");
    res.render("login");
});


app.post("/login", async (req, res) => {
    const getUser = req.body.username;
    const getPass = req.body.password;

    try {
        const checkUser = await db.query(
            "SELECT * FROM login_info WHERE username = $1",
            [getUser]
        );

        if (checkUser.rows.length > 0) {
            const user = checkUser.rows[0];
            const storedPassword = user.user_password;

            const result = await bcrypt.compare(getPass, storedPassword);

            if (result) {
                res.redirect("/new-invoice");
            } else {
                res.redirect("/");
            }
        } else {
            res.redirect("/");
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/send-otp", async (req, res) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    currentOTP = otp;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'vijaytailors1979@gmail.com',        // Replace with your Gmail
            pass: 'spfu bivd oldy zdsw'    // Replace with your app password
        }
    });

    const mailOptions = {
        from: 'yourapp@gmail.com',
        to: 'vijaytailors1979@gmail.com',
        subject: 'OTP to change password',
        text: `Your OTP is ${otp}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error("Error sending mail:", err);
        res.json({ success: false });
    }
});


app.post("/verify-otp", express.json(), (req, res) => {
    const userOTP = req.body.otp;
    if (userOTP === currentOTP) {
        currentOTP = null;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});


app.post("/change-password", express.json(), async (req, res) => {
    const newPassword = req.body.newPassword;

    try {
        // Update hardcoded user. Replace with logic if multiple users exist
        bcrypt.hash(newPassword, saltRounds, async (err,hash) =>{
            if(err){
                console.log(err);
                return res.json({ success: false });
            }else{
                const result = await db.query(
                "UPDATE login_info SET user_password = $1",
                [hash]
            ); 
          console.log(result);
        res.json({ success: true });
        }        
      })  
    } catch (err) {
        console.error("Password update error:", err);
        res.json({ success: false });
    }
});




app.get("/new-invoice", async(req,res)=>{
    try{
        const result = await db.query("SELECT MAX(invoice_number) as last_invoice_num FROM invoice_info");
        const getLastBillNum = result.rows[0].last_invoice_num || 0;
        const nextInvoiceNum = getLastBillNum + 1;

        res.render("index", {invoice_number : nextInvoiceNum});
    }catch(err){
        console.log(err);
        res.status(500).send("Error Loading the form");
    }
});



app.post("/submit", async(req,res)=>{
    const invoice_num = req.body.invoice_number;
    const invoice_date = req.body.invoice_date;
    const delDate = req.body.delivery_date;
    const cust_num = req.body.customer_contact;
    const cust_name = req.body.customer_name;
    const totalinput  = req.body.money_total;
    const advanceinput = req.body.money_advance;
    const remainingInput = req.body.money_remaining;

    const validItems = [];

    for(let i = 1; i <= 8; i++){
        const getquantity = req.body[`serial${i}`];
        const getproduct = req.body[`product-desc${i}`];
        const getmoney = req.body[`money-for-product-${i}`];

        if(getquantity && getproduct && getmoney){
            validItems.push({
                quantity : getquantity.trim(),
                product : getproduct.trim(),
                money : parseFloat(getmoney) || 0
            });
        }
    }

    // Validation checks (same as before)
    if(!invoice_date) {
        return res.status(400).json({
            success: false,
            message: "कृपया बिल की तारीख भरें"
        });
    }

    if(!delDate) {
        return res.status(400).json({
            success: false,
            message: "कृपया डिलीवरी की तारीख भरें"
        });
    }

    if(!cust_name || cust_name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: "कृपया ग्राहक का नाम भरें"
        });
    }

    if(!cust_num) {
        return res.status(400).json({
            success: false,
            message: "कृपया फोन नंबर भरें, check if 10 digits long"
        });
    }

    if(!advanceinput){
        return res.status(400).json({
            success : false,
            message : "Fill the advance amount"
        })
    }

    if(validItems.length === 0){
        return res.status(400).json({
            success: false,
            message: "कृपया कम से कम एक उत्पाद की जानकारी भरें"
        });
    }

    let invoiceId; // Store the actual database ID

    try{
        await db.query('BEGIN');

        const invoice_result = 
        await db.query("INSERT INTO invoice_info(invoice_number, invoice_date, delivery_date, customer_name, customer_phone, money_total, money_advance, money_remaining) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [invoice_num, invoice_date, delDate, cust_name, cust_num, totalinput, advanceinput, remainingInput]
        );
    
        invoiceId = invoice_result.rows[0].id; // Store the actual ID
        
        for(const item of validItems){
            await db.query(
                "INSERT INTO invoice_items(invoice_id, quantity, product, product_money) VALUES($1, $2, $3, $4)",
                [invoiceId, item.quantity, item.product, item.money]
            );
        }

        await db.query('COMMIT');

        // Update Excel file AFTER successful database commit
        await updateExcelFile(invoiceId);

        res.json({
            success : true,
            message : "Invoice Created",
            bill_num : invoice_num
        });

    }catch(error){
        await db.query('ROLLBACK');
        console.error('Database error:', error);
        res.status(500).json({
            success : false,
            error: "Failed to create invoice"
        });
    }
});


app.post("/export", async(req,res)=>{
    try{
        const joinRes = await db.query(
            "SELECT invoice_info.invoice_number, invoice_info.invoice_date, invoice_info.delivery_date, invoice_info.customer_name, invoice_info.customer_phone,invoice_info.money_total,invoice_info.money_advance,invoice_info.money_remaining,invoice_items.quantity, invoice_items.product,invoice_items.product_money FROM invoice_info JOIN invoice_items ON invoice_info.id = invoice_items.invoice_id;"
        );

        const workbook = new ExcelJs.Workbook();
        const sheet = workbook.addWorksheet("All_Invoice_Data");

        sheet.properties.defaultColWidth = 17;
        sheet.properties.defaultRowHeight = 20;

        sheet.columns = Object.keys(joinRes.rows[0]).map((key) => ({
            header: key,
            key: key,
        }));

        sheet.getRow(1).eachCell((cell) => {
             cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFB7DEE8" } // Light blue
            };
            cell.font = { bold: false };
        });

        let previousInvoice = null;
        let rowIndex = 2;

        joinRes.rows.forEach((row, i) => {
            const currentInvoice = row.invoice_number;

            // Clone the row to avoid mutating original data
            const cleanRow = { ...row };

            // Blank out repeated invoice info
            if (currentInvoice === previousInvoice) {
                cleanRow.invoice_number = "";
                cleanRow.invoice_date = "";
                cleanRow.delivery_date = "";
                cleanRow.customer_name = "";
                cleanRow.customer_phone = "";
                cleanRow.money_total = "";
                cleanRow.money_advance = "";
                cleanRow.money_remaining = "";
            }

            // Add cleaned row
            sheet.addRow(cleanRow);
            sheet.getRow(rowIndex).height = 20;
            rowIndex++;

            // Insert empty row after last line of each invoice
            const nextInvoice = joinRes.rows[i + 1]?.invoice_number;
            if (currentInvoice !== nextInvoice) {
                sheet.addRow([]);
                rowIndex++;
            }

            previousInvoice = currentInvoice;
        });

        // Instead of writing to file, send directly to client
        const fileName = `All_Invoice_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        // Write workbook to response stream
        await workbook.xlsx.write(res);
        res.end();

    }catch(err){
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Error exporting data"
        });
    }
});


// Separate function to handle Excel updates
async function updateExcelFile(invoiceId) {
    try {
        console.log("Updating Excel file for invoice ID:", invoiceId);
        
        // Get the invoice data using the correct ID
        const newInvoiceRes = await db.query(
            `SELECT 
                invoice_info.invoice_number, 
                invoice_info.invoice_date, 
                invoice_info.delivery_date, 
                invoice_info.customer_name, 
                invoice_info.customer_phone, 
                invoice_info.money_total, 
                invoice_info.money_advance, 
                invoice_info.money_remaining, 
                invoice_items.quantity, 
                invoice_items.product, 
                invoice_items.product_money 
            FROM invoice_info 
            JOIN invoice_items ON invoice_info.id = invoice_items.invoice_id 
            WHERE invoice_info.id = $1
            ORDER BY invoice_items.id`,
            [invoiceId]
        );

        if (newInvoiceRes.rows.length === 0) {
            console.log("No data found for invoice ID:", invoiceId);
            return;
        }

        let workbook;
        let sheet;
        
        // Check if Excel file exists
        if (fs.existsSync("invoices.xlsx")) {
            // Load existing workbook
            workbook = new ExcelJs.Workbook();
            await workbook.xlsx.readFile("invoices.xlsx");
            sheet = workbook.getWorksheet("Invoices");
        } else {
            // Create new workbook if file doesn't exist
            workbook = new ExcelJs.Workbook();
            sheet = workbook.addWorksheet("Invoices");
            
            sheet.properties.defaultColWidth = 17;
            sheet.properties.defaultRowHeight = 20;

            // Set up headers with proper column names
            const headers = [
                "Invoice Number", "Invoice Date", "Delivery Date", "Customer Name", 
                "Customer Phone", "Total Amount", "Advance Amount", "Remaining Amount",
                "Quantity", "Product", "Product Amount"
            ];

            sheet.columns = headers.map((header, index) => ({
                header: header,
                key: Object.keys(newInvoiceRes.rows[0])[index],
                width: 15
            }));

            // Style the header row
            sheet.getRow(1).eachCell((cell) => {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFB7DEE8" } // Light blue
                };
                cell.font = { bold: true };
                cell.alignment = { horizontal: 'center' };
            });
        }

        // Find the next row to add data
        let lastRow = sheet.lastRow ? sheet.lastRow.number : 1;
        
        // Add empty row before new invoice (if not the first data row)
        if (lastRow > 1) {
            sheet.addRow([]);
            lastRow++;
        }

        // Add new invoice data
        newInvoiceRes.rows.forEach((row, i) => {
            const rowData = [
                i === 0 ? row.invoice_number : "", // Only show invoice details on first row
                i === 0 ? row.invoice_date : "",
                i === 0 ? row.delivery_date : "",
                i === 0 ? row.customer_name : "",
                i === 0 ? row.customer_phone : "",
                i === 0 ? row.money_total : "",
                i === 0 ? row.money_advance : "",
                i === 0 ? row.money_remaining : "",
                row.quantity,
                row.product,
                row.product_money
            ];

            sheet.addRow(rowData);
            lastRow++;
            
            // Style the row
            const currentRow = sheet.getRow(lastRow);
            currentRow.height = 20;
            currentRow.eachCell((cell) => {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });
        });

        // Save the updated workbook
        await workbook.xlsx.writeFile("invoices.xlsx");
        console.log("Excel file updated successfully with new entry.");
        console.log("File saved at:", process.cwd() + "/invoices.xlsx");

    } catch (err) {
        console.error("Error updating Excel file:", err);
        // Don't throw the error as it shouldn't affect the invoice creation
    }
}

app.post("/new-bill", (req,res)=>{
    res.redirect("/new-invoice");
})


app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
