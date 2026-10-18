import asyncio  
import logging  
from aiogram import Bot, Dispatcher, F, types  
from aiogram.filters import CommandStart  
from aiogram.fsm.context import FSMContext  
from aiogram.fsm.state import State, StatesGroup  
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup  
  
# Твой токен от @BotFather  
TOKEN = "8964095085:AAH5V052SGbTA8m0jwD9US3P9MP16Wry6KQ"  
  
# Твой Telegram ID для получения заявок  
ADMIN_ID = 5887982303  
  
bot = Bot(token=TOKEN)  
dp = Dispatcher()  
  
  
# Состояния для анкеты (FSM)  
class Form(StatesGroup):  
  waiting_for_name = State()  
  waiting_for_tariff = State()  
  
  
# Главное меню с кнопками  
def get_main_keyboard():  
  keyboard = InlineKeyboardMarkup(  
      inline_keyboard=[  
          [  
              InlineKeyboardButton(  
                  text="🔥 Заполнить анкету (Приватка)", callback_data="apply"  
              )  
          ],  
          [  
              InlineKeyboardButton(  
                  text="💎 Тарифы и что внутри", callback_data="tariffs"  
              )  
          ],  
          [  
              InlineKeyboardButton(  
                  text="📢 Наш Telegram-канал", url="https://t.me/bodgrindd"  
              )  
          ],  
      ]  
  )  
  return keyboard  
  
  
# Кнопки выбора тарифов  
def get_tariffs_keyboard():  
  keyboard = InlineKeyboardMarkup(  
      inline_keyboard=[  
          [  
              InlineKeyboardButton(  
                  text="🚀 Базовый УБТ ($150)", callback_data="select_base"  
              )  
          ],  
          [  
              InlineKeyboardButton(  
                  text="👑 Приватка / Наставничество ($350)",  
                  callback_data="select_private",  
              )  
          ],  
          [  
              InlineKeyboardButton(  
                  text="⬅️ Назад в меню", callback_data="back_to_menu"  
              )  
          ],  
      ]  
  )  
  return keyboard  
  
  
# Команда /start  
@dp.message(CommandStart())  
async def cmd_start(message: types.Message):  
  text = (  
      "🔥 **2 месяца = твои первые деньги на УБТ трафике**\n\n"  
      "Закрытое обучение и приватное комьюнити. Веду тебя с нуля до первого"  
      " стабильного дохода на заливах трафика из соцсетей в ТГ-каналы.\n\n"  
      "• 4 года моего опыта в УБТ\n"  
      "• 0$ вложений на старте\n"  
      "• Только рабочие связки без воды\n\n"  
      "Выбирай действие ниже 👇"  
  )  
  await message.answer(  
      text, reply_markup=get_main_keyboard(), parse_mode="Markdown"  
  )  
  
  
# Обработка кнопки «Тарифы»  
@dp.callback_query(F.data == "tariffs")  
async def show_tariffs(callback: types.CallbackQuery):  
  text = (  
      "💎 **ТАРИФЫ ОБУЧЕНИЯ**\n\n"  
      "1️⃣ **Базовый УБТ — $150**\n"  
      "• Пошаговая система залива TikTok & Shorts\n"  
      "• Разбор рабочих связок\n"  
      "• Доступ к общему чату\n\n"  
      "2️⃣ **Приватка (Наставничество) — $350**\n"  
      "• Всё из Базового тарифа\n"  
      "• Личные консультации и разбор каналов\n"  
      "• Поддержка кураторов на каждом шаге\n"  
      "• Закрытый приват-чат"  
  )  
  await callback.message.edit_text(  
      text, reply_markup=get_tariffs_keyboard(), parse_mode="Markdown"  
  )  
  await callback.answer()  
  
  
# Возврат в главное меню  
@dp.callback_query(F.data == "back_to_menu")  
async def back_menu(callback: types.CallbackQuery):  
  text = (  
      "🔥 **2 месяца = твои первые деньги на УБТ трафике**\n\n"  
      "Выбирай действие ниже 👇"  
  )  
  await callback.message.edit_text(  
      text, reply_markup=get_main_keyboard(), parse_mode="Markdown"  
  )  
  await callback.answer()  
  
  
# Начало заполнения анкеты  
@dp.callback_query(F.data == "apply")  
async def start_apply(callback: types.CallbackQuery, state: FSMContext):  
  await callback.message.answer(  
      "📝 Напиши свое **имя** или **никнейм**, чтобы мы знали, как к тебе"  
      " обращаться:"  
  )  
  await state.set_state(Form.waiting_for_name)  
  await callback.answer()  
  
  
# Получение имени  
@dp.message(Form.waiting_for_name)  
async def process_name(message: types.Message, state: FSMContext):  
  await state.update_data(name=message.text)  
  
  keyboard = InlineKeyboardMarkup(  
      inline_keyboard=[  
          [  
              InlineKeyboardButton(  
                  text="Базовый ($150)", callback_data="select_base"  
              )  
          ],  
          [  
              InlineKeyboardButton(  
                  text="Приватка ($350)", callback_data="select_private"  
              )  
          ],  
      ]  
  )  
  await message.answer(  
      "Отлично! Теперь выбери интересующий тебя тариф:", reply_markup=keyboard  
  )  
  await state.set_state(Form.waiting_for_tariff)  
  
  
# Получение тарифа и завершение анкеты  
@dp.callback_query(  
    Form.waiting_for_tariff, F.data.in_({"select_base", "select_private"})  
)  
async def process_tariff(callback: types.CallbackQuery, state: FSMContext):  
  tariff_name = (  
      "Базовый ($150)" if callback.data == "select_base" else "Приватка ($350)"  
  )  
  data = await state.get_data()  
  user_name = data.get("name")  
  user = callback.from_user  
  
  # Формируем текст заявки для тебя  
  admin_text = (  
      "📥 **Новая заявка на УБТ обучение!**\n\n"  
      f"👤 Имя: {user_name}\n"  
      f"🏷 Юзернейм: @{user.username if user.username else 'нет'}\n"  
      f"🆔 ID: `{user.id}`\n"  
      f"💎 Тариф: {tariff_name}"  
  )  
  
  # Отправляем заявку тебе в ЛС  
  try:  
    await bot.send_message(ADMIN_ID, admin_text, parse_mode="Markdown")  
  except Exception as e:  
    print(f"Не удалось отправить админу: {e}")  
  
  # Ответ пользователю  
  await callback.message.edit_text(  
      "✅ **Заявка успешно отправлена!**\n\n"  
      "Твоя анкета принята. Скоро я свяжусь с тобой в личных сообщениях для"  
      " старта.",  
      parse_mode="Markdown",  
  )  
  await state.clear()  
  await callback.answer()  
  
  
async def main():  
  logging.basicConfig(level=logging.INFO)  
  print("Бот запущен и готов принимать заявки...")  
  await dp.start_polling(bot)  
  
  
if __name__ == "__main__":  
  asyncio.run(main())  
