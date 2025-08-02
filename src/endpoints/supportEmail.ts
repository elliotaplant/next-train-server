import { Bool, OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext/browser";

export class SupportEmail extends OpenAPIRoute {
	schema = {
		tags: ["Support"],
		summary: "Send support email",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							email: Str({ example: "user@example.com" }),
							question: Str({ example: "How do I add a new transit stop?" }),
						}),
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Email sent successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							message: Str(),
						}),
					},
				},
			},
			"500": {
				description: "Failed to send email",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { email, question } = data.body;

		try {
			const msg = createMimeMessage();
			msg.setSender({ name: "NextTrain Support", addr: "next-train-support@elliotplant.com" });
			msg.setRecipient("elliotaplant@gmail.com");
			msg.setSubject(`NextTrain Support Request from ${email}`);
			
			// Add both plain text and HTML versions
			msg.addMessage({
				contentType: 'text/plain',
				data: `Support request from: ${email}\n\nQuestion/Feedback:\n${question}`
			});
			
			msg.addMessage({
				contentType: 'text/html',
				data: `
					<h2>NextTrain Support Request</h2>
					<p><strong>From:</strong> ${email}</p>
					<p><strong>Question/Feedback:</strong></p>
					<p>${question.replace(/\n/g, '<br>')}</p>
				`
			});

			const message = new EmailMessage(
				"next-train-support@elliotplant.com",
				"elliotaplant@gmail.com",
				msg.asRaw()
			);

			await c.env.SUPPORT_EMAIL.send(message);

			return {
				success: true,
				message: "Your message has been sent successfully!",
			};
		} catch (error) {
			console.error("Email send error:", error);
			return Response.json(
				{
					success: false,
					error: "An error occurred while sending your message.",
				},
				{ status: 500 }
			);
		}
	}
}
