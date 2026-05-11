import json
from openai import AsyncOpenAI, OpenAIError
from dotenv import load_dotenv
from fastapi import HTTPException
from Prompts.sys_prompt import sys_prompt
from Utils.Chat.chat_bg_ import save_to_history, load_history
from Utils.Tools.tool_definitions import tools
from Utils.Tools.tool_handler import handle_tool_call
import os

load_dotenv()

MODEL_NAME=os.getenv('OPEN_AI_MODEL')
API_KEY=os.getenv('OPENAI_API')

client = AsyncOpenAI(
    api_key=API_KEY
    # base_url='https://api.deepseek.com',
)


async def send_response(user_query: str):
    user_query_dict= {"role": "user", "content": user_query}

    save_to_history(user_query_dict)

    history = load_history(10)  # last 10 lines ≈ 5 user + 5 assistant
    # Remove the current message if it ended up in history (we just saved it)
    if history and history[-1].get("content") == user_query and history[-1].get("role") == "user":
        history = history[:-1]

    messages = [
        sys_prompt,
        *history,
        user_query_dict,
    ]

    try:
        while True:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                tools=tools,
                # reasoning_effort="low",
            )

            choice = response.choices[0]

            # If the model wants to call tools, execute them and loop back
            if choice.finish_reason == "tool_calls":
                messages.append(choice.message)

                for tool_call in choice.message.tool_calls:
                    arguments = json.loads(tool_call.function.arguments)
                    result = handle_tool_call(tool_call.function.name, arguments)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    })

                continue  # send tool results back to the model

            # Otherwise the model is done — return the text

            save_to_history({"role": "assistant", "content": choice.message.content})
            return choice.message.content

    except OpenAIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API Error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
