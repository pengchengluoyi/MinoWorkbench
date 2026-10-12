let epoch = 0
const controllers = new Set<AbortController>()

export const accountEpoch = () => epoch
export const trackAccountRequest = (controller: AbortController) => { controllers.add(controller) }
export const finishAccountRequest = (controller?: AbortController) => { if (controller) controllers.delete(controller) }
export const resetAccountRequests = () => {
  epoch += 1
  controllers.forEach((controller) => controller.abort())
  controllers.clear()
}
