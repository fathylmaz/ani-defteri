import logging
from django.http import JsonResponse
from django.core.exceptions import RequestDataTooBig, TooManyFilesSent, ValidationError


class ApiErrors:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exc):
        if isinstance(
            exc, (ValueError, ValidationError, RequestDataTooBig, TooManyFilesSent)
        ):
            return JsonResponse(
                {"error": "Geçersiz veri veya yükleme sınırı aşıldı."}, status=400
            )
        logging.getLogger(__name__).exception("API request failed")
        return JsonResponse(
            {"error": "İşlem tamamlanamadı. Lütfen yeniden deneyin."}, status=500
        )
