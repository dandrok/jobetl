import "dotenv/config";
import { sendNewsletter } from "@core/email";
import type { MatchCandidate } from "@core/types";

async function run() {
  try {
    const env = {
      jinaApiKey: "",
      deepseekApiKey: "",
      resendApiKey: process.env.RESEND_API_KEY,
      senderEmail: process.env.SENDER_EMAIL,
      recipientEmail: process.env.RECIPIENT_EMAIL
    };

    console.log("--- CONFIGURATION CHECK ---");
    console.log("Sender Email:   ", env.senderEmail);
    console.log("Recipient Email:", env.recipientEmail);
    console.log(
      "API Key Present:",
      env.resendApiKey ? "Yes (length: " + env.resendApiKey.length + ")" : "No"
    );
    console.log("----------------------------\n");

    const mockJobs: MatchCandidate[] = [
      {
        job: {
          externalId: "test-1",
          source: "justjoinit",
          url: "https://justjoin.it/offers/test-software-engineer-jobetl",
          title: "Senior TypeScript Engineer (Test)",
          company: "JobETL Analytics Corp",
          salaryText: "22,000 - 28,000 PLN",
          location: "Warsaw, Poland (Hybrid)"
        },
        match: {
          score: 0.94,
          reason:
            "This is a simulated matched job to verify your Resend integration. The candidate profile matches the required TypeScript skill set with a high score of 94%.",
          summary: "Perfect test match.",
          shouldSave: true
        }
      }
    ];

    console.log("Attempting to dispatch test email...");
    const success = await sendNewsletter(mockJobs, env);
    if (success) {
      console.log("Email script run complete.");
    } else {
      console.error("Email sending failed.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Test script failed:", error);
    process.exitCode = 1;
  }
}

run();
