import {app} from "@azure/functions";

async function NormalizeAudio(request, context) {
    try {
        context.log(`Http function processed request for url "${request.url}"`);

        return {
            status: 200,
            body: "Warmed up",
        };
    } catch (error) {
        context.log(`Error in Trigger Warmup function: ${error}`);

        return {
            status: 500,
            body: "Internal server error",
        };
    }
}

app.http("TriggerWarmup", {
    methods: ["POST"],
    authLevel: "function",
    handler: NormalizeAudio,
});